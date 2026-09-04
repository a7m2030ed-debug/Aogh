import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../features/auth/phone_otp_screen.dart';
import '../../features/catalog/part_details_screen.dart';
import '../../features/chat/conversation_screen.dart';
import '../../features/chat/messages_list_screen.dart';
import '../../features/dealer/add_listing_screen.dart';
import '../../features/dealer/dealer_dashboard_screen.dart';
import '../../features/dealer/register_dealer_screen.dart';
import '../../features/legal/legal_document_screen.dart';
import '../../features/orders/my_orders_screen.dart';
import '../../features/profile/profile_screen.dart';
import '../../features/search/home_screen.dart';
import '../../features/search/image_search_screen.dart';
import '../../features/search/search_results_screen.dart';
import '../../shared/widgets/app_bottom_nav_shell.dart';

/// One router for the whole app: the five-tab shell (customer golden path,
/// spec section 45) plus pushed routes for everything that shouldn't show
/// the bottom nav (chat, part details, dealer flows, auth).
final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/login', builder: (context, state) => const PhoneOtpScreen()),
    GoRoute(
      path: '/search',
      builder: (context, state) => SearchResultsScreen(
        query: state.uri.queryParameters['q'] ?? '',
      ),
    ),
    GoRoute(path: '/search/image', builder: (context, state) => const ImageSearchScreen()),
    GoRoute(
      path: '/part/:id',
      builder: (context, state) => PartDetailsScreen(listingId: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/chat/:id',
      builder: (context, state) => ConversationScreen(
        listingId: state.uri.queryParameters['listingId'],
      ),
    ),
    GoRoute(path: '/dealer/add-listing', builder: (context, state) => const AddListingScreen()),
    GoRoute(path: '/dealer/register', builder: (context, state) => const RegisterDealerScreen()),
    GoRoute(path: '/dealer/dashboard', builder: (context, state) => const DealerDashboardScreen()),
    GoRoute(
      path: '/legal/privacy',
      builder: (context, state) => const LegalDocumentScreen(document: LegalDocument.privacyPolicy),
    ),
    GoRoute(
      path: '/legal/terms',
      builder: (context, state) => const LegalDocumentScreen(document: LegalDocument.termsOfUse),
    ),
    StatefulShellRoute.indexedStack(
      builder: (context, state, navigationShell) => AppBottomNavShell(navigationShell: navigationShell),
      branches: [
        StatefulShellBranch(routes: [GoRoute(path: '/', builder: (context, state) => const HomeScreen())]),
        StatefulShellBranch(routes: [
          GoRoute(path: '/tab-search', builder: (context, state) => const SearchResultsScreen(query: ''))
        ]),
        StatefulShellBranch(routes: [GoRoute(path: '/orders', builder: (context, state) => const MyOrdersScreen())]),
        StatefulShellBranch(routes: [GoRoute(path: '/messages', builder: (context, state) => const MessagesListScreen())]),
        StatefulShellBranch(routes: [GoRoute(path: '/profile', builder: (context, state) => const ProfileScreen())]),
      ],
    ),
  ],
);
