package expo.modules.materialyou

import android.os.Build
import android.view.HapticFeedbackConstants
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Material You, as far as the app needs it: the system's wallpaper colours
 * and its haptic vocabulary.
 *
 * Colours: on Android 14+ the system publishes the full set of Material 3
 * colour roles — primary, containers, the five surface containers, outlines —
 * already computed from the wallpaper, the chosen colour style and the
 * contrast setting, for light and dark. Those are what Material apps draw
 * with, so they are read as they are. Android 12 and 13 publish only the
 * tonal palettes the roles are built from; those are returned for the app to
 * map itself. Before 12 there is nothing to read.
 *
 * Every resource is looked up by name rather than by compiled constant, so a
 * role a given release doesn't publish is simply left out instead of failing.
 */
class MaterialYouModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MaterialYou")

    /** The system colours, or null before Android 12. */
    Function("getColors") {
      readColors()
    }

    /** Plays one of the system's own haptic effects. Returns whether it was handed over. */
    Function("performHaptic") { kind: String ->
      performHaptic(kind)
    }
  }

  private fun color(name: String): String? {
    val context = appContext.reactContext ?: return null
    return try {
      val id = android.R.color::class.java.getField(name).getInt(null)
      String.format("#%06X", 0xFFFFFF and context.getColor(id))
    } catch (_: Exception) {
      null
    }
  }

  private fun readColors(): Map<String, Any?>? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null

    val palettes = mutableMapOf<String, Map<String, String>>()
    for (palette in PALETTES) {
      val tones = mutableMapOf<String, String>()
      for (tone in TONES) {
        color("system_${palette}_$tone")?.let { tones[tone.toString()] = it }
      }
      if (tones.isNotEmpty()) palettes[palette] = tones
    }

    val roles = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      mapOf("light" to readRoles("light"), "dark" to readRoles("dark"))
    } else {
      null
    }

    return mapOf(
      "sdk" to Build.VERSION.SDK_INT,
      "palettes" to palettes,
      "light" to roles?.get("light"),
      "dark" to roles?.get("dark"),
    )
  }

  private fun readRoles(mode: String): Map<String, String>? {
    val out = mutableMapOf<String, String>()
    for (role in ROLES) {
      color("system_${snake(role)}_$mode")?.let { out[role] = it }
    }
    return out.ifEmpty { null }
  }

  private fun performHaptic(kind: String): Boolean {
    val activity = appContext.currentActivity ?: return false
    val view = activity.window?.decorView ?: return false
    val sdk = Build.VERSION.SDK_INT
    val constant = when (kind) {
      "tick" -> if (sdk >= 34) HapticFeedbackConstants.SEGMENT_TICK else HapticFeedbackConstants.CLOCK_TICK
      "press" -> HapticFeedbackConstants.KEYBOARD_TAP
      "heavy" -> HapticFeedbackConstants.LONG_PRESS
      "success" -> if (sdk >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
      "error" -> if (sdk >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
      "toggleOn" -> if (sdk >= 34) HapticFeedbackConstants.TOGGLE_ON else HapticFeedbackConstants.CLOCK_TICK
      "toggleOff" -> if (sdk >= 34) HapticFeedbackConstants.TOGGLE_OFF else HapticFeedbackConstants.CLOCK_TICK
      "threshold" -> if (sdk >= 34) HapticFeedbackConstants.GESTURE_THRESHOLD_ACTIVATE else HapticFeedbackConstants.CONTEXT_CLICK
      else -> return false
    }
    activity.runOnUiThread {
      try {
        view.performHapticFeedback(constant)
      } catch (_: Exception) {
      }
    }
    return true
  }

  private companion object {
    val PALETTES = listOf("accent1", "accent2", "accent3", "neutral1", "neutral2")
    val TONES = listOf(0, 10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000)
    val ROLES = listOf(
      "primary", "onPrimary", "primaryContainer", "onPrimaryContainer",
      "secondary", "onSecondary", "secondaryContainer", "onSecondaryContainer",
      "tertiary", "onTertiary", "tertiaryContainer", "onTertiaryContainer",
      "error", "onError", "errorContainer", "onErrorContainer",
      "background", "onBackground",
      "surface", "onSurface", "surfaceVariant", "onSurfaceVariant",
      "surfaceDim", "surfaceBright",
      "surfaceContainerLowest", "surfaceContainerLow", "surfaceContainer",
      "surfaceContainerHigh", "surfaceContainerHighest",
      "outline", "outlineVariant",
    )

    /** onPrimaryContainer → on_primary_container. */
    fun snake(name: String): String =
      name.replace(Regex("([a-z])([A-Z])")) { "${it.groupValues[1]}_${it.groupValues[2].lowercase()}" }
  }
}
