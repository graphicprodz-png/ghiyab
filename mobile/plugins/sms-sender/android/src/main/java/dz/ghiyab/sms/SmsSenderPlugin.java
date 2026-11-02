package dz.ghiyab.sms;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.telephony.SmsManager;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Random;
import java.util.UUID;

/**
 * يرسل SMS من شريحة الجهاز مباشرة (بدون فتح تطبيق الرسائل)،
 * ويُرجع النتيجة الحقيقية من الشبكة لكل أجزاء الرسالة.
 */
@CapacitorPlugin(
    name = "SmsSender",
    permissions = { @Permission(alias = "sms", strings = { Manifest.permission.SEND_SMS }) }
)
public class SmsSenderPlugin extends Plugin {

    private static final String ACTION_SENT = "dz.ghiyab.sms.SENT";
    private static final long TIMEOUT_MS = 60000;
    private final Random random = new Random();

    @PluginMethod
    public void send(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "smsPermCallback");
            return;
        }
        doSend(call);
    }

    @PermissionCallback
    private void smsPermCallback(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) {
            doSend(call);
        } else {
            call.reject("لم يُسمح للتطبيق بإرسال الرسائل. فعّل إذن «الرسائل» من إعدادات التطبيق في أندرويد.");
        }
    }

    @PluginMethod
    public void keepAwake(PluginCall call) {
        Activity act = getActivity();
        if (act != null) {
            act.runOnUiThread(() -> act.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
        }
        call.resolve();
    }

    private void doSend(final PluginCall call) {
        final String phone = call.getString("phone");
        final String message = call.getString("message");
        if (phone == null || phone.trim().isEmpty() || message == null || message.isEmpty()) {
            call.reject("رقم الهاتف أو نص الرسالة فارغ");
            return;
        }

        final Context ctx = getContext();
        SmsManager sms;
        try {
            sms = Build.VERSION.SDK_INT >= 31 ? ctx.getSystemService(SmsManager.class) : SmsManager.getDefault();
        } catch (Exception e) {
            sms = null;
        }
        if (sms == null) {
            call.reject("هذا الجهاز لا يدعم إرسال الرسائل القصيرة (لا توجد شريحة؟)");
            return;
        }

        final ArrayList<String> parts = sms.divideMessage(message);
        final int total = parts.size();
        final String token = UUID.randomUUID().toString();
        final int[] done = { 0 };
        final boolean[] finished = { false };
        final Handler handler = new Handler(Looper.getMainLooper());

        final BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                if (!token.equals(intent.getStringExtra("token"))) return;
                int code = getResultCode();
                synchronized (finished) {
                    if (finished[0]) return;
                    if (code != Activity.RESULT_OK) {
                        finished[0] = true;
                        safeUnregister(ctx, this);
                        call.reject(errorText(code));
                        return;
                    }
                    done[0]++;
                    if (done[0] >= total) {
                        finished[0] = true;
                        safeUnregister(ctx, this);
                        JSObject r = new JSObject();
                        r.put("parts", total);
                        call.resolve(r);
                    }
                }
            }
        };

        IntentFilter filter = new IntentFilter(ACTION_SENT);
        if (Build.VERSION.SDK_INT >= 33) {
            ctx.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            ctx.registerReceiver(receiver, filter);
        }

        ArrayList<PendingIntent> sentIntents = new ArrayList<>();
        int base = random.nextInt(1_000_000) * 10;
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        for (int i = 0; i < total; i++) {
            Intent it = new Intent(ACTION_SENT);
            it.setPackage(ctx.getPackageName());
            it.putExtra("token", token);
            it.putExtra("part", i);
            sentIntents.add(PendingIntent.getBroadcast(ctx, base + i, it, flags));
        }

        // بعض الأجهزة لا تُبلغ بالنتيجة: بعد دقيقة نعتبر الرسالة قد أُرسلت
        handler.postDelayed(() -> {
            synchronized (finished) {
                if (finished[0]) return;
                finished[0] = true;
                safeUnregister(ctx, receiver);
                JSObject r = new JSObject();
                r.put("parts", total);
                r.put("unconfirmed", true);
                call.resolve(r);
            }
        }, TIMEOUT_MS);

        try {
            sms.sendMultipartTextMessage(phone.trim(), null, parts, sentIntents, null);
        } catch (Exception e) {
            synchronized (finished) {
                if (!finished[0]) {
                    finished[0] = true;
                    safeUnregister(ctx, receiver);
                    call.reject("تعذّر الإرسال: " + e.getMessage());
                }
            }
        }
    }

    private static void safeUnregister(Context ctx, BroadcastReceiver r) {
        try { ctx.unregisterReceiver(r); } catch (Exception ignored) { }
    }

    private static String errorText(int code) {
        switch (code) {
            case SmsManager.RESULT_ERROR_NO_SERVICE:
                return "لا توجد تغطية شبكة";
            case SmsManager.RESULT_ERROR_RADIO_OFF:
                return "الشبكة متوقفة (وضع الطيران؟)";
            case SmsManager.RESULT_ERROR_NULL_PDU:
                return "خطأ في تكوين الرسالة";
            case SmsManager.RESULT_ERROR_GENERIC_FAILURE:
                return "فشل الإرسال — تحقق من رصيد الشريحة";
            default:
                return "فشل الإرسال (رمز " + code + ")";
        }
    }
}
