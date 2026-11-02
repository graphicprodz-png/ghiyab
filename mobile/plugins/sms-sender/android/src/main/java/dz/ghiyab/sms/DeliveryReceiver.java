package dz.ghiyab.sms;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.telephony.SmsMessage;
import org.json.JSONObject;

/** تقرير الاستلام من الشبكة: هل وصلت الرسالة فعلاً إلى هاتف الولي؟ يعمل حتى والتطبيق في الخلفية. */
public class DeliveryReceiver extends BroadcastReceiver {
    static final String PREFS = "hodouri_dlr";

    @Override
    public void onReceive(Context c, Intent i) {
        String ref = i.getStringExtra("ref");
        if (ref == null) return;
        int st = -1;
        try {
            byte[] pdu = i.getByteArrayExtra("pdu");
            String fmt = i.getStringExtra("format");
            if (pdu != null) {
                SmsMessage m = Build.VERSION.SDK_INT >= 23 ? SmsMessage.createFromPdu(pdu, fmt) : SmsMessage.createFromPdu(pdu);
                if (m != null) st = m.getStatus();
            }
        } catch (Exception ignored) { }
        String state;
        if (st == -1) state = getResultCode() == Activity.RESULT_OK ? "ok" : "unknown";
        else if (st < 0x20) state = "ok";          // تم التسليم
        else if (st >= 0x40) state = "fail";       // فشل نهائي (رقم غير موجود، هاتف خارج الخدمة طويلاً…)
        else return;                               // ما زالت الشبكة تحاول
        try {
            SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONObject o = new JSONObject(sp.getString("d", "{}"));
            JSONObject r = new JSONObject();
            r.put("s", state);
            r.put("t", System.currentTimeMillis());
            o.put(ref, r);
            sp.edit().putString("d", o.toString()).apply();
        } catch (Exception ignored) { }
    }
}
