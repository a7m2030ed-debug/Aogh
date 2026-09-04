import 'package:flutter/widgets.dart';

/// Lets code outside the widget tree (ApiClient's 401 interceptor) trigger
/// navigation without a BuildContext of its own. Kept in its own tiny file
/// rather than inside app_router.dart so importing it from core/api/ never
/// drags in every feature screen app_router.dart imports (which would
/// import api_client.dart right back — a real circular import, not just a
/// theoretical one, since most screens import ApiClient).
final rootNavigatorKey = GlobalKey<NavigatorState>();
