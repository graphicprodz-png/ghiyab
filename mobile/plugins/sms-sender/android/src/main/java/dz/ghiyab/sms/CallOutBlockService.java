package dz.ghiyab.sms;

import android.net.Uri;
import android.telecom.CallRedirectionService;
import android.telecom.PhoneAccountHandle;
import androidx.annotation.RequiresApi;

/** يلغي المكالمات الصادرة من الطابليت إذا فعّلت المؤسسة «حجب المكالمات الصادرة». أرقام الطوارئ لا تمر من هنا أبداً. */
@RequiresApi(29)
public class CallOutBlockService extends CallRedirectionService {
    @Override
    public void onPlaceCall(Uri handle, PhoneAccountHandle initialPhoneAccount, boolean allowInteractiveResponse) {
        if (CallPrefs.p(this).getBoolean("blockOut", false)) {
            CallPrefs.log(this, "out", handle == null ? "" : handle.getSchemeSpecificPart());
            cancelCall();
        } else {
            placeCallUnmodified();
        }
    }
}
