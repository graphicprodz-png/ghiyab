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
import android.os.Environment;
import android.provider.MediaStore;
import android.content.ContentValues;
import android.content.ContentResolver;
import android.net.Uri;
import android.database.Cursor;
import android.content.ContentUris;
import androidx.core.content.FileProvider;
import android.util.Base64;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.telephony.SmsManager;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;
import android.telephony.TelephonyManager;

import com.getcapacitor.JSArray;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import androidx.activity.result.ActivityResult;
import android.app.role.RoleManager;
import android.content.SharedPreferences;
import org.json.JSONArray;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.UUID;

/**
 * يرسل SMS من شريحة الجهاز مباشرة (بدون فتح تطبيق الرسائل)،
 * ويُرجع النتيجة الحقيقية من الشبكة لكل أجزاء الرسالة.
 */
@CapacitorPlugin(
    name = "SmsSender",
    permissions = {
        @Permission(alias = "sms", strings = { Manifest.permission.SEND_SMS }),
        @Permission(alias = "phone", strings = { Manifest.permission.READ_PHONE_STATE }),
        @Permission(alias = "call", strings = { Manifest.permission.CALL_PHONE })
    }
)
public class SmsSenderPlugin extends Plugin {

    private static final String ACTION_SENT = "dz.ghiyab.sms.SENT";
    private static final long TIMEOUT_MS = 60000;
    private final Random random = new Random();

    @Override
    public void load() {
        // فحص الأصالة عند كل تشغيل: إن كانت النسخة معدّلة أو مُعاد توقيعها، تُستبدل الواجهة برسالة
        new Thread(() -> {
            if (Guard.ok(getContext())) return;
            Activity act = getActivity();
            if (act == null) return;
            act.runOnUiThread(() -> {
                try {
                    android.webkit.WebView wv = getBridge().getWebView();
                    wv.stopLoading();
                    wv.getSettings().setJavaScriptEnabled(false);
                    wv.loadDataWithBaseURL(null, Guard.BLOCKED, "text/html", "utf-8", null);
                } catch (Exception e) {
                    act.finishAndRemoveTask();
                }
            });
        }).start();
    }

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

    /** قائمة الشرائح الموجودة في الجهاز (موبيليس، جيزي، أوريدو...) */
    @PluginMethod
    public void getSims(PluginCall call) {
        if (getPermissionState("phone") != PermissionState.GRANTED) {
            requestPermissionForAlias("phone", call, "phonePermCallback");
            return;
        }
        doGetSims(call);
    }

    @PermissionCallback
    private void phonePermCallback(PluginCall call) {
        if (getPermissionState("phone") == PermissionState.GRANTED) doGetSims(call);
        else call.reject("لم يُسمح للتطبيق بمعرفة الشرائح. فعّل إذن «الهاتف» من إعدادات التطبيق في أندرويد.");
    }

    private void doGetSims(PluginCall call) {
        JSArray arr = new JSArray();
        int def = -1;
        try {
            SubscriptionManager sm = (SubscriptionManager) getContext().getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE);
            if (Build.VERSION.SDK_INT >= 24) def = SubscriptionManager.getDefaultSmsSubscriptionId();
            List<SubscriptionInfo> list = sm != null ? sm.getActiveSubscriptionInfoList() : null;
            if (list != null) {
                for (SubscriptionInfo si : list) {
                    JSObject o = new JSObject();
                    o.put("id", si.getSubscriptionId());
                    o.put("slot", si.getSimSlotIndex());
                    o.put("carrier", si.getCarrierName() != null ? si.getCarrierName().toString() : "");
                    o.put("name", si.getDisplayName() != null ? si.getDisplayName().toString() : "");
                    o.put("isDefault", si.getSubscriptionId() == def);
                    arr.put(o);
                }
            }
        } catch (SecurityException e) {
            call.reject("لا يوجد إذن لقراءة الشرائح");
            return;
        } catch (Exception e) {
            call.reject("تعذّرت قراءة الشرائح: " + e.getMessage());
            return;
        }
        JSObject r = new JSObject();
        r.put("sims", arr);
        r.put("defaultSms", def);
        call.resolve(r);
    }

    /** طباعة الصفحة الحالية أو حفظها PDF (A4 أفقي) عبر نافذة الطباعة في أندرويد */
    @PluginMethod
    public void print(PluginCall call) {
        final String name = call.getString("name", "ghiyab");
        final boolean landscape = call.getBoolean("landscape", true);
        Activity act = getActivity();
        if (act == null) { call.reject("لا توجد واجهة"); return; }
        act.runOnUiThread(() -> {
            try {
                WebView wv = getBridge().getWebView();
                PrintManager pm = (PrintManager) act.getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter adapter = wv.createPrintDocumentAdapter(name);
                PrintAttributes.MediaSize size = landscape ? PrintAttributes.MediaSize.ISO_A4.asLandscape() : PrintAttributes.MediaSize.ISO_A4;
                PrintAttributes attrs = new PrintAttributes.Builder().setMediaSize(size).build();
                pm.print(name, adapter, attrs);
                call.resolve();
            } catch (Exception e) {
                call.reject("تعذّرت الطباعة: " + e.getMessage());
            }
        });
    }

    /** حفظ ملف (Excel، نسخة احتياطية...) في مجلد التنزيلات */
    @PluginMethod
    public void saveFile(PluginCall call) {
        String name = call.getString("name", "ghiyab.bin");
        String b64 = call.getString("base64", "");
        String mime = call.getString("mime", "application/octet-stream");
        boolean overwrite = Boolean.TRUE.equals(call.getBoolean("overwrite", false));
        try {
            byte[] data = Base64.decode(b64, Base64.DEFAULT);
            String path;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentResolver res = getContext().getContentResolver();
                // استبدال نفس الملف (للنسخ التلقائي) بدل إنشاء نسخة جديدة كل مرة
                if (overwrite) {
                    Uri found = null;
                    try (Cursor c = res.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI, new String[]{ MediaStore.Downloads._ID },
                            MediaStore.Downloads.DISPLAY_NAME + "=? AND " + MediaStore.Downloads.RELATIVE_PATH + "=?",
                            new String[]{ name, Environment.DIRECTORY_DOWNLOADS + "/Hodouri/" }, null)) {
                        if (c != null && c.moveToFirst()) found = ContentUris.withAppendedId(MediaStore.Downloads.EXTERNAL_CONTENT_URI, c.getLong(0));
                    } catch (Exception ignored) { }
                    if (found != null) {
                        try (OutputStream os = res.openOutputStream(found, "wt")) {
                            os.write(data);
                            JSObject r = new JSObject();
                            r.put("path", "Download/Hodouri/" + name);
                            call.resolve(r);
                            return;
                        } catch (Exception ignored) { }
                    }
                }
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(MediaStore.Downloads.MIME_TYPE, mime);
                v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Hodouri");
                Uri uri = res.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new Exception("تعذّر إنشاء الملف");
                try (OutputStream os = res.openOutputStream(uri)) { os.write(data); }
                path = "Download/Hodouri/" + name;
            } else {
                File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                File f = new File(dir, name);
                try (FileOutputStream os = new FileOutputStream(f)) { os.write(data); }
                path = f.getAbsolutePath();
            }
            JSObject r = new JSObject();
            r.put("path", path);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("تعذّر حفظ الملف: " + e.getMessage());
        }
    }

    /** مشاركة ملف عبر واتساب أو البريد أو Google Drive... */
    @PluginMethod
    public void shareFile(PluginCall call) {
        String name = call.getString("name", "ghiyab.json");
        String b64 = call.getString("base64", "");
        String mime = call.getString("mime", "application/octet-stream");
        Activity act = getActivity();
        try {
            byte[] data = Base64.decode(b64, Base64.DEFAULT);
            Uri uri;
            File f = new File(getContext().getCacheDir(), name);
            try (FileOutputStream os = new FileOutputStream(f)) { os.write(data); }
            try {
                uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            } catch (IllegalArgumentException e) {
                File f2 = new File(getContext().getExternalFilesDir(null), name);
                try (FileOutputStream os = new FileOutputStream(f2)) { os.write(data); }
                uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f2);
            }
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType(mime);
            i.putExtra(Intent.EXTRA_STREAM, uri);
            i.putExtra(Intent.EXTRA_SUBJECT, name);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(i, "مشاركة الملف");
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            act.startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("تعذّرت المشاركة: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getDeviceId(PluginCall call) {
        String id = null;
        try { id = android.provider.Settings.Secure.getString(getContext().getContentResolver(), android.provider.Settings.Secure.ANDROID_ID); } catch (Exception e) { }
        JSObject r = new JSObject();
        r.put("id", id == null ? "" : id);
        r.put("model", Build.MANUFACTURER + " " + Build.MODEL);
        call.resolve(r);
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
        // الشريحة المختارة (موبيليس/جيزي/أوريدو) أو الشريحة الافتراضية للرسائل
        Integer subId = call.getInt("subscriptionId");
        SmsManager sms;
        try {
            if (subId != null && subId >= 0) {
                sms = Build.VERSION.SDK_INT >= 31
                    ? ctx.getSystemService(SmsManager.class).createForSubscriptionId(subId)
                    : SmsManager.getSmsManagerForSubscriptionId(subId);
            } else {
                sms = Build.VERSION.SDK_INT >= 31 ? ctx.getSystemService(SmsManager.class) : SmsManager.getDefault();
            }
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
                        call.reject(errorText(code), errorCode(code));
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
            // تقرير الاستلام: نطلبه على آخر جزء من الرسالة فقط
            ArrayList<PendingIntent> dlv = null;
            String ref = call.getString("ref");
            if (ref != null && !ref.isEmpty()) {
                dlv = new ArrayList<>();
                int dflags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                for (int i = 0; i < total; i++) {
                    if (i < total - 1) { dlv.add(null); continue; }
                    Intent di = new Intent(ctx, DeliveryReceiver.class);
                    di.putExtra("ref", ref);
                    dlv.add(PendingIntent.getBroadcast(ctx, base + 5 + i, di, dflags));
                }
            }
            sms.sendMultipartTextMessage(phone.trim(), null, parts, sentIntents, dlv);
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

    private static String errorCode(int code) {
        switch (code) {
            case SmsManager.RESULT_ERROR_NO_SERVICE: return "NO_SERVICE";
            case SmsManager.RESULT_ERROR_RADIO_OFF: return "RADIO_OFF";
            case SmsManager.RESULT_ERROR_NULL_PDU: return "NULL_PDU";
            case SmsManager.RESULT_ERROR_GENERIC_FAILURE: return "GENERIC";
            default: return "E" + code;
        }
    }

    @PluginMethod
    public void getDeliveries(PluginCall call) {
        SharedPreferences sp = getContext().getSharedPreferences(DeliveryReceiver.PREFS, Context.MODE_PRIVATE);
        JSObject r = new JSObject();
        try { r.put("d", new org.json.JSONObject(sp.getString("d", "{}"))); } catch (Exception e) { r.put("d", new JSObject()); }
        if (Boolean.TRUE.equals(call.getBoolean("clear", false))) sp.edit().putString("d", "{}").apply();
        call.resolve(r);
    }

    // ===== حجب المكالمات (أندرويد 10 فما فوق) =====
    private static final String ROLE_IN = "android.app.role.CALL_SCREENING";
    private static final String ROLE_OUT = "android.app.role.CALL_REDIRECTION";

    private boolean hasRole(String role) {
        if (Build.VERSION.SDK_INT < 29) return false;
        try {
            RoleManager rm = (RoleManager) getContext().getSystemService(Context.ROLE_SERVICE);
            return rm != null && rm.isRoleAvailable(role) && rm.isRoleHeld(role);
        } catch (Exception e) { return false; }
    }

    private boolean roleAvailable(String role) {
        if (Build.VERSION.SDK_INT < 29) return false;
        try {
            RoleManager rm = (RoleManager) getContext().getSystemService(Context.ROLE_SERVICE);
            return rm != null && rm.isRoleAvailable(role);
        } catch (Exception e) { return false; }
    }

    @PluginMethod
    public void getCallBlock(PluginCall call) {
        SharedPreferences sp = CallPrefs.p(getContext());
        JSObject r = new JSObject();
        r.put("supported", Build.VERSION.SDK_INT >= 29);
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("inAvailable", roleAvailable(ROLE_IN));
        r.put("outAvailable", roleAvailable(ROLE_OUT));
        r.put("inRole", hasRole(ROLE_IN));
        r.put("outRole", hasRole(ROLE_OUT));
        r.put("blockIn", sp.getBoolean("blockIn", false));
        r.put("blockOut", sp.getBoolean("blockOut", false));
        r.put("autoReply", sp.getBoolean("autoReply", false));
        try { r.put("log", new JSONArray(sp.getString("log", "[]"))); } catch (Exception e) { r.put("log", new JSONArray()); }
        call.resolve(r);
    }

    @PluginMethod
    public void setCallBlock(PluginCall call) {
        SharedPreferences.Editor e = CallPrefs.p(getContext()).edit();
        if (call.hasOption("blockIn")) e.putBoolean("blockIn", Boolean.TRUE.equals(call.getBoolean("blockIn")));
        if (call.hasOption("blockOut")) e.putBoolean("blockOut", Boolean.TRUE.equals(call.getBoolean("blockOut")));
        if (call.hasOption("autoReply")) e.putBoolean("autoReply", Boolean.TRUE.equals(call.getBoolean("autoReply")));
        if (call.hasOption("replyText")) e.putString("replyText", call.getString("replyText", ""));
        if (Boolean.TRUE.equals(call.getBoolean("clearLog", false))) e.putString("log", "[]");
        e.apply();
        getCallBlock(call);
    }

    @PluginMethod
    public void requestCallRole(PluginCall call) {
        if (Build.VERSION.SDK_INT < 29) { call.reject("حجب المكالمات يتطلب أندرويد 10 أو أحدث"); return; }
        String role = "out".equals(call.getString("which")) ? ROLE_OUT : ROLE_IN;
        if (!roleAvailable(role)) { call.reject("هذا الجهاز لا يسمح بهذه الخاصية"); return; }
        if (hasRole(role)) { getCallBlock(call); return; }
        RoleManager rm = (RoleManager) getContext().getSystemService(Context.ROLE_SERVICE);
        startActivityForResult(call, rm.createRequestRoleIntent(role), "callRoleResult");
    }

    @ActivityCallback
    private void callRoleResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        getCallBlock(call);
    }

    // الاستعلام عن الرصيد برمز USSD (مثل *222#) دون مغادرة التطبيق — أندرويد 8 فما فوق
    @PluginMethod
    public void checkBalance(PluginCall call) {
        if (Build.VERSION.SDK_INT < 26) { call.reject("الاستعلام عن الرصيد يتطلب أندرويد 8 أو أحدث"); return; }
        if (getPermissionState("call") != PermissionState.GRANTED) {
            requestPermissionForAlias("call", call, "callPermCallback");
            return;
        }
        doUssd(call);
    }

    @PermissionCallback
    private void callPermCallback(PluginCall call) {
        if (getPermissionState("call") == PermissionState.GRANTED) doUssd(call);
        else call.reject("لم يُسمح بالاستعلام عن الرصيد. فعّل إذن «الهاتف/المكالمات» من إعدادات التطبيق.");
    }

    private void doUssd(final PluginCall call) {
        final String code = call.getString("code");
        if (code == null || code.trim().isEmpty()) { call.reject("رمز الاستعلام فارغ"); return; }
        TelephonyManager tm = (TelephonyManager) getContext().getSystemService(Context.TELEPHONY_SERVICE);
        if (tm == null) { call.reject("الجهاز لا يدعم الاتصالات"); return; }
        Integer sub = call.getInt("subscriptionId");
        if (sub != null && sub >= 0) {
            try { tm = tm.createForSubscriptionId(sub); } catch (Exception ignored) { }
        }
        final boolean[] done = { false };
        final Handler h = new Handler(Looper.getMainLooper());
        try {
            tm.sendUssdRequest(code.trim(), new TelephonyManager.UssdResponseCallback() {
                @Override
                public void onReceiveUssdResponse(TelephonyManager t, String req, CharSequence resp) {
                    synchronized (done) { if (done[0]) return; done[0] = true; }
                    JSObject r = new JSObject();
                    r.put("text", resp == null ? "" : resp.toString());
                    call.resolve(r);
                }
                @Override
                public void onReceiveUssdResponseFailed(TelephonyManager t, String req, int failureCode) {
                    synchronized (done) { if (done[0]) return; done[0] = true; }
                    call.reject("لم يردّ المتعامل على طلب الرصيد (رمز " + failureCode + ")");
                }
            }, h);
        } catch (SecurityException e) {
            call.reject("لا توجد صلاحية للاستعلام عن الرصيد");
            return;
        } catch (Exception e) {
            call.reject("تعذّر الاستعلام: " + e.getMessage());
            return;
        }
        h.postDelayed(() -> {
            synchronized (done) { if (done[0]) return; done[0] = true; }
            call.reject("انتهت مهلة انتظار رد المتعامل");
        }, 40000);
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
