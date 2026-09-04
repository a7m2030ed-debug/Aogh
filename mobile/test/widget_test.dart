// Replaces the default counter-app template test (this app has no counter)
// with a minimal smoke test: the app must at least build and land on the
// home screen without throwing. Home screen's own network calls (backend
// isn't reachable in a widget test) are left unresolved on purpose — a
// single pump() is enough to prove the widget tree constructs correctly,
// without needing pumpAndSettle() to wait on requests that will never
// complete here.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:carparts_app/main.dart';

void main() {
  testWidgets('app builds and shows the home screen', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: CarPartsApp()));
    await tester.pump();

    expect(find.text('قطعتي'), findsOneWidget);
  });
}
