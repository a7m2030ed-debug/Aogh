import 'package:geolocator/geolocator.dart';

/// Wraps geolocator's permission dance behind one call that never throws.
/// Every caller gets `null` back if location isn't available for any
/// reason (service off, permission denied/permanently denied, platform
/// error) and falls back to its no-location behavior — unsorted dealer
/// lists, no distance badge on a listing card — rather than crashing a
/// screen over what's an enhancement, not a requirement (spec section 25:
/// the delivery-fee/distance features were always meant to degrade
/// gracefully without a maps provider, not fail hard without one).
///
/// Requires the location permission entries `flutter create .` doesn't add
/// on its own — see mobile/README.md.
Future<Position?> tryGetCurrentPosition() async {
  try {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return null;

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return null;
    }

    return await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.medium),
    );
  } catch (_) {
    return null;
  }
}
