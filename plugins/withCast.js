/**
 * Declares Google Cast's options provider in the Android manifest.
 *
 * The Cast framework reads its configuration from a class named in the
 * manifest, and refuses to start without one. Media3's
 * DefaultCastOptionsProvider targets Google's Default Media Receiver — what
 * Nest and Google Home speakers play — so no custom receiver is registered.
 * The player library already bundles media3-cast; this is the one line it
 * leaves to the app.
 *
 * A manifest change is native: it takes a new build, not an OTA update.
 */
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const OPTIONS_PROVIDER = 'com.google.android.gms.cast.framework.OPTIONS_PROVIDER_CLASS_NAME';
const DEFAULT_PROVIDER = 'androidx.media3.cast.DefaultCastOptionsProvider';

module.exports = function withCast(config) {
  return withAndroidManifest(config, (config) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, OPTIONS_PROVIDER, DEFAULT_PROVIDER);
    return config;
  });
};
