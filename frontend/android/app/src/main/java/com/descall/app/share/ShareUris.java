package com.descall.app.share;

import java.util.Locale;

/**
 * Which shared streams "Paylaş > Descall" copies (DescallSharePlugin.streams). Pure Java, unit
 * tested (src/test/.../ShareUrisTest.java).
 *
 * DescallShareActivity is exported: any app can hand it an EXTRA_STREAM, and the sheet opens
 * it with this app's own ContentResolver, which may read this app's own providers. The
 * FileProvider (${applicationId}.fileprovider, xml/file_paths.xml) serves the whole cache
 * directory, so a crafted content://com.descall.app.fileprovider/my_cache_images/... URI
 * attached the app's private cache (WebView HTTP cache, decoded media) to a message, with the
 * target chat preset through EXTRA_SHORTCUT_ID. Only content URIs of other apps' providers
 * are taken; file: URIs never are.
 */
public final class ShareUris {
  private ShareUris() {}

  public static boolean accepted(String scheme, String authority, String ownPackage) {
    if (!"content".equals(scheme) || authority == null || authority.isEmpty()) return false;
    // content://<userId>@<authority>/... reaches the same provider (ContentProvider userId form).
    String host = authority.substring(authority.lastIndexOf('@') + 1).toLowerCase(Locale.ROOT);
    String own = ownPackage == null ? "" : ownPackage.toLowerCase(Locale.ROOT);
    return own.isEmpty() || !(host.equals(own) || host.startsWith(own + "."));
  }
}
