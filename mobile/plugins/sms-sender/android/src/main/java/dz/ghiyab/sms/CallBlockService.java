package dz.ghiyab.sms;

import android.content.SharedPreferences;
import android.net.Uri;
import android.telecom.Call;
import android.telecom.CallScreeningService;
import android.telephony.SmsManager;
import androidx.annotation.RequiresApi;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** يرفض المكالمات الواردة إذا فعّلت المؤسسة «حجب المكالمات الواردة». */
@RequiresApi(29)
public class CallBlockService extends CallScreeningService {
    @Override
    public void onScreenCall(Call.Details d) {
        SharedPreferences sp = CallPrefs.p(this);
        boolean incoming = d.getCallDirection() == Call.Details.DIRECTION_INCOMING;
        if (!incoming || !sp.getBoolean("blockIn", false)) {
            respondToCall(d, new CallResponse.Builder().build());
            return;
        }
        String number = "";
        Uri h = d.getHandle();
        if (h != null) number = h.getSchemeSpecificPart();
        respondToCall(d, new CallResponse.Builder()
                .setDisallowCall(true)
                .setRejectCall(true)
                .setSkipNotification(true)
                .setSkipCallLog(false)
                .build());
        CallPrefs.log(this, "in", number);
        autoReply(sp, number);
    }

    /** رد آلي برسالة (مرة واحدة في اليوم لكل رقم) */
    private void autoReply(SharedPreferences sp, String number) {
        try {
            if (!sp.getBoolean("autoReply", false) || number == null || number.replaceAll("\\D", "").length() < 9) return;
            String text = sp.getString("replyText", "");
            if (text.isEmpty()) return;
            String day = new SimpleDateFormat("yyyyMMdd", Locale.US).format(new Date());
            String key = "r_" + number.replaceAll("\\D", "");
            if (day.equals(sp.getString(key, ""))) return;
            sp.edit().putString(key, day).apply();
            SmsManager sms = SmsManager.getDefault();
            sms.sendMultipartTextMessage(number, null, sms.divideMessage(text), null, null);
            CallPrefs.log(this, "reply", number);
        } catch (Exception ignored) { }
    }
}
