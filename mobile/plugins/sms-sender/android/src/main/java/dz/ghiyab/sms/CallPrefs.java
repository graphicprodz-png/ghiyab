package dz.ghiyab.sms;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

/** إعدادات حجب المكالمات وسجلّها (تُقرأ من خدمات النظام حتى والتطبيق مغلق). */
public final class CallPrefs {
    static final String NAME = "hodouri_calls";
    private CallPrefs() { }

    static SharedPreferences p(Context c) { return c.getSharedPreferences(NAME, Context.MODE_PRIVATE); }

    static void log(Context c, String type, String number) {
        try {
            SharedPreferences sp = p(c);
            JSONArray a = new JSONArray(sp.getString("log", "[]"));
            JSONObject o = new JSONObject();
            o.put("t", System.currentTimeMillis());
            o.put("type", type);
            o.put("n", number == null ? "" : number);
            JSONArray b = new JSONArray();
            b.put(o);
            for (int i = 0; i < a.length() && i < 49; i++) b.put(a.get(i));
            sp.edit().putString("log", b.toString()).apply();
        } catch (Exception ignored) { }
    }
}
