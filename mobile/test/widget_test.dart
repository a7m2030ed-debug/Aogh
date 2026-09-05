// Replaces the default counter-app template test (this app has no counter)
// with a minimal smoke test: the app must build and land on the customer's
// request form without throwing.
//
// The API client is overridden with an adapter that fails every call
// immediately. The screen's catalog fetch is meant to degrade gracefully
// (the form still works without it), so this exercises that path — and it
// keeps the test honest: a real Dio would leave its timeout timers pending
// after the tree is disposed, which the test framework rejects.

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:carparts_app/core/api/api_client.dart';
import 'package:carparts_app/main.dart';

class _OfflineAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    throw DioException.connectionError(
      requestOptions: options,
      reason: 'offline in tests',
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  testWidgets('app builds and lands on the request form', (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWith((ref) {
            final client = ApiClient(ref.read(authTokenStoreProvider));
            client.dio.httpClientAdapter = _OfflineAdapter();
            return client;
          }),
        ],
        child: const CarPartsApp(),
      ),
    );
    // Not pumpAndSettle: the screen shows a progress indicator until the
    // catalog call resolves, and that animation never settles. The AppBar
    // title renders on the first frame either way, which is all a smoke
    // test needs to prove.
    await tester.pump();
    // Let the stubbed request and its timeout timers finish so none are
    // left pending when the tree is disposed.
    await tester.pump(const Duration(seconds: 1));

    expect(find.text('وش القطعة اللي تدور عليها؟'), findsOneWidget);
  });
}
