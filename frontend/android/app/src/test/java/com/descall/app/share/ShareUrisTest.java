package com.descall.app.share;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Which shared streams the share sheet copies (DescallSharePlugin.streams). Any app can send
 * DescallShareActivity an EXTRA_STREAM, and our own ContentResolver may open our own
 * providers: content://com.descall.app.fileprovider/my_cache_images/... named the app's
 * private cache, which the sheet then attached and uploaded.
 */
public class ShareUrisTest {
  private static final String PKG = "com.descall.app";

  @Test
  public void otherAppsContentIsAccepted() {
    assertTrue(ShareUris.accepted("content", "com.android.providers.media.documents", PKG));
    assertTrue(ShareUris.accepted("content", "media", PKG));
    assertTrue(ShareUris.accepted("content", "com.google.android.apps.photos.contentprovider", PKG));
  }

  @Test
  public void ownProvidersAndFileUrisAreRefused() {
    assertFalse(ShareUris.accepted("content", PKG + ".fileprovider", PKG));
    assertFalse(ShareUris.accepted("content", "COM.DESCALL.APP.FileProvider", PKG));
    assertFalse(ShareUris.accepted("content", PKG, PKG));
    assertFalse(ShareUris.accepted("content", "user@" + PKG + ".fileprovider", PKG));
    assertFalse(ShareUris.accepted("content", "0@" + PKG + ".fileprovider", PKG));
    assertFalse(ShareUris.accepted("file", null, PKG));
    assertFalse(ShareUris.accepted("content", null, PKG));
    assertFalse(ShareUris.accepted("content", "", PKG));
    assertFalse(ShareUris.accepted(null, "media", PKG));
  }

  @Test
  public void similarNamesOfOtherAppsStayAccepted() {
    assertTrue(ShareUris.accepted("content", "com.descall.appx.provider", PKG));
  }
}
