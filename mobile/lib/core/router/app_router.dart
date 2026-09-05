import 'package:go_router/go_router.dart';
import '../../features/auth/phone_otp_screen.dart';
import '../../features/chat/conversation_screen.dart';
import '../../features/chat/messages_list_screen.dart';
import '../../features/dealer/dealer_dashboard_screen.dart';
import '../../features/dealer/register_dealer_screen.dart';
import '../../features/legal/legal_document_screen.dart';
import '../../features/profile/profile_screen.dart';
import '../../features/requests/my_requests_screen.dart';
import '../../features/requests/new_request_screen.dart';
import '../../features/requests/request_details_screen.dart';
import '../../shared/widgets/app_bottom_nav_shell.dart';
import 'navigator_key.dart';

/// Customers get the four-tab shell (اطلب قطعة / طلباتي / الرسائل / حسابي);
/// dealers get the request inbox at /dealer/dashboard, which the login flow
/// routes them to directly. Everything that shouldn't show the bottom nav
/// (chat, request details, auth, legal) is a pushed route.
final appRouter = GoRouter(
  navigatorKey: rootNavigatorKey,
  initialLocation: '/',
  routes: [
    GoRoute(path: '/login', builder: (context, state) => const PhoneOtpScreen()),
    GoRoute(
      path: '/requests/:id',
      builder: (context, state) =>
          RequestDetailsScreen(requestId: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/chat/:id',
      builder: (context, state) =>
          ConversationScreen(conversationId: state.pathParameters['id']!),
    ),
    GoRoute(path: '/dealer/register', builder: (context, state) => const RegisterDealerScreen()),
    GoRoute(path: '/dealer/dashboard', builder: (context, state) => const DealerDashboardScreen()),
    GoRoute(
      path: '/dealer/chats',
      builder: (context, state) => const MessagesListScreen(dealerSide: true),
    ),
    // The dealer app has no tab bar, so it reaches the profile through this
    // pushed route rather than the shell's /profile branch.
    GoRoute(path: '/profile-page', builder: (context, state) => const ProfileScreen()),
    GoRoute(
      path: '/legal/privacy',
      builder: (context, state) => const LegalDocumentScreen(document: LegalDocument.privacyPolicy),
    ),
    GoRoute(
      path: '/legal/terms',
      builder: (context, state) => const LegalDocumentScreen(document: LegalDocument.termsOfUse),
    ),
    StatefulShellRoute.indexedStack(
      builder: (context, state, navigationShell) =>
          AppBottomNavShell(navigationShell: navigationShell),
      branches: [
        StatefulShellBranch(
          routes: [GoRoute(path: '/', builder: (context, state) => const NewRequestScreen())],
        ),
        StatefulShellBranch(
          routes: [GoRoute(path: '/requests', builder: (context, state) => const MyRequestsScreen())],
        ),
        StatefulShellBranch(
          routes: [GoRoute(path: '/messages', builder: (context, state) => const MessagesListScreen())],
        ),
        StatefulShellBranch(
          routes: [GoRoute(path: '/profile', builder: (context, state) => const ProfileScreen())],
        ),
      ],
    ),
  ],
);
