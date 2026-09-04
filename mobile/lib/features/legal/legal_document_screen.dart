import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';

enum LegalDocument { privacyPolicy, termsOfUse }

extension on LegalDocument {
  String get endpoint => switch (this) {
        LegalDocument.privacyPolicy => '/legal/privacy-policy',
        LegalDocument.termsOfUse => '/legal/terms-of-use',
      };
  String get titleAr => switch (this) {
        LegalDocument.privacyPolicy => 'سياسة الخصوصية',
        LegalDocument.termsOfUse => 'شروط الاستخدام',
      };
}

/// Fetches whichever document from GET /legal/... (backend/src/modules/legal)
/// — the .md files under backend/legal/ are the single source of truth, so
/// editing wording there is the entire "update the policy" workflow; this
/// screen never hardcodes the text.
class LegalDocumentScreen extends ConsumerWidget {
  const LegalDocumentScreen({super.key, required this.document});

  final LegalDocument document;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final apiClient = ref.watch(apiClientProvider);

    return Scaffold(
      appBar: AppBar(title: Text(document.titleAr)),
      body: FutureBuilder(
        future: apiClient.dio.get(document.endpoint),
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Text('تعذّر تحميل المستند. تأكد من الاتصال بالخادم.',
                  style: Theme.of(context).textTheme.bodyMedium),
            );
          }
          final content = snapshot.data?.data['content'] as String? ?? '';
          return SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            // Plain text, not rendered Markdown — good enough to read; a
            // real Markdown renderer is a small dependency to add later
            // if the formatting (tables, headings) needs to look nicer.
            child: SelectableText(content, style: Theme.of(context).textTheme.bodyMedium),
          );
        },
      ),
    );
  }
}
