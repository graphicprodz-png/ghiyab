package dz.ghiyab.sms;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import java.io.InputStream;
import java.security.MessageDigest;

/**
 * حماية التطبيق من التعديل وإعادة التوزيع:
 *  1) التطبيق موقّع بمفتاح TitteriSoft فقط (أي إعادة توقيع = رفض).
 *  2) كود الواجهة (index.html) مطابق لبصمته وقت البناء (أي تعديل = رفض).
 */
final class Guard {
    private static final String CERT = "27686bd2aa23e87edb525bf62e6d1751b48b6f594c8bc3be11ef2ad8cd1af541";
    private static final String WEB = "__WEB_HASH__"; // تُكتب آلياً أثناء البناء

    static final String BLOCKED =
        "<html dir='rtl'><body style='font-family:sans-serif;background:#0f6b4f;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center'>"
        + "<div style='padding:24px'><h2>نسخة غير أصلية</h2><p>هذه النسخة من تطبيق حضوري معدّلة أو غير موقّعة من TitteriSoft.</p>"
        + "<p>حمّل النسخة الأصلية من www.titterisoft.com<br>واتساب: 0783 22 76 98</p></div></body></html>";

    private Guard() { }

    static boolean ok(Context c) {
        try {
            if (!certOk(c)) return false;
            if (!WEB.startsWith("__") && !WEB.equals(sha(c.getAssets().open("public/index.html")))) return false;
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @SuppressWarnings("deprecation")
    private static boolean certOk(Context c) throws Exception {
        PackageManager pm = c.getPackageManager();
        Signature[] sigs;
        if (Build.VERSION.SDK_INT >= 28) {
            PackageInfo pi = pm.getPackageInfo(c.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
            sigs = pi.signingInfo.hasMultipleSigners() ? pi.signingInfo.getApkContentsSigners() : pi.signingInfo.getSigningCertificateHistory();
        } else {
            sigs = pm.getPackageInfo(c.getPackageName(), PackageManager.GET_SIGNATURES).signatures;
        }
        if (sigs == null || sigs.length == 0) return false;
        for (Signature s : sigs) {
            if (CERT.equals(hex(MessageDigest.getInstance("SHA-256").digest(s.toByteArray())))) return true;
        }
        return false;
    }

    private static String sha(InputStream in) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] buf = new byte[65536];
        int n;
        try { while ((n = in.read(buf)) > 0) md.update(buf, 0, n); } finally { in.close(); }
        return hex(md.digest());
    }

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }
}
