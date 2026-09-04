import 'package:flutter/material.dart';

class ChatMessage {
  const ChatMessage({required this.text, required this.fromMe});
  final String text;
  final bool fromMe;
}

/// Spec sections 21-23: chat tied to one listing/order, with a negotiation
/// strip pinned above the composer. Matches the review's v1 scope
/// (section 6): free-text negotiation ending in one "تأكيد الاتفاق"
/// button, not the structured offer/counter-offer UI deferred to v2.
class ConversationScreen extends StatefulWidget {
  const ConversationScreen({super.key, this.listingId});

  final String? listingId;

  @override
  State<ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends State<ConversationScreen> {
  final _controller = TextEditingController();
  final List<ChatMessage> _messages = [
    const ChatMessage(text: 'هل فيها كسر؟', fromMe: true),
    const ChatMessage(text: 'لا، فيها خدوش بسيطة.', fromMe: false),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _send() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _messages.add(ChatMessage(text: text, fromMe: true));
      _controller.clear();
    });
    // TODO: POST /conversations/:id/messages
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('تشليح فوزان')),
      body: Column(
        children: [
          const _NegotiationStrip(currentPrice: 400),
          Expanded(
            child: ListView.builder(
              reverse: true,
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length,
              itemBuilder: (context, i) {
                final message = _messages[_messages.length - 1 - i];
                return Align(
                  alignment: message.fromMe ? Alignment.centerLeft : Alignment.centerRight,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: message.fromMe
                          ? Theme.of(context).colorScheme.primaryContainer
                          : Theme.of(context).colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Text(message.text),
                  ),
                );
              },
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Row(
                children: [
                  IconButton(onPressed: () {}, icon: const Icon(Icons.image_outlined)),
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      decoration: const InputDecoration(hintText: 'اكتب رسالة...'),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  IconButton(onPressed: _send, icon: const Icon(Icons.send)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NegotiationStrip extends StatelessWidget {
  const _NegotiationStrip({required this.currentPrice});
  final num currentPrice;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Theme.of(context).colorScheme.secondaryContainer,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Expanded(child: Text('آخر عرض: $currentPrice ريال')),
          TextButton(onPressed: () {}, child: const Text('عرض سعر')), // TODO: POST offers
          FilledButton(onPressed: () {}, child: const Text('تم الاتفاق')), // TODO: offers/accept
        ],
      ),
    );
  }
}
