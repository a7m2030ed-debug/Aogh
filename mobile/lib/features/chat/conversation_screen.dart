import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/api/api_client.dart';
import '../../core/api/media_upload_service.dart';

class ChatMessage {
  const ChatMessage({required this.text, required this.fromMe, this.imageUrl});
  final String text;
  final bool fromMe;
  final String? imageUrl;

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        text: json['text'] as String? ?? '',
        fromMe: json['senderType'] == 'USER',
        imageUrl: json['imageUrl'] as String?,
      );
}

/// Spec sections 21-23: chat tied to one listing/order, with a negotiation
/// strip pinned above the composer. Matches the review's v1 scope
/// (section 6): free-text negotiation ending in one "تأكيد الاتفاق"
/// button, not the structured offer/counter-offer UI deferred to v2.
///
/// `conversationId` is either a real id (opened from messages_list_screen)
/// or the literal "new" (opened from part_details_screen, which also
/// passes `listingId`/`dealerId` so POST /conversations can be called
/// here on first load — the route can't call it itself, only a widget can).
class ConversationScreen extends ConsumerStatefulWidget {
  const ConversationScreen({super.key, required this.conversationId, this.listingId, this.dealerId});

  final String conversationId;
  final String? listingId;
  final String? dealerId;

  @override
  ConsumerState<ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends ConsumerState<ConversationScreen> {
  final _controller = TextEditingController();
  String? _resolvedConversationId;
  List<ChatMessage> _messages = [];
  num? _lastOfferPrice;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _init();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _init() async {
    try {
      if (widget.conversationId == 'new') {
        if (widget.dealerId == null) {
          setState(() {
            _error = 'تعذّر بدء المحادثة: لا يوجد تاجر محدد.';
            _loading = false;
          });
          return;
        }
        final apiClient = ref.read(apiClientProvider);
        final response = await apiClient.dio.post('/conversations', data: {
          'dealerId': widget.dealerId,
          'listingId': widget.listingId,
        });
        _resolvedConversationId = response.data['id'] as String;
      } else {
        _resolvedConversationId = widget.conversationId;
      }
      await _loadMessages();
    } on DioException {
      if (!mounted) return;
      setState(() {
        _error = 'تعذّر فتح المحادثة. تأكد من تسجيل الدخول والاتصال بالخادم.';
        _loading = false;
      });
    }
  }

  Future<void> _loadMessages() async {
    final apiClient = ref.read(apiClientProvider);
    final response = await apiClient.dio.get('/conversations/$_resolvedConversationId/messages');
    if (!mounted) return;
    setState(() {
      _messages = (response.data as List)
          .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
          .toList();
      _loading = false;
    });
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _resolvedConversationId == null) return;
    _controller.clear();
    try {
      final apiClient = ref.read(apiClientProvider);
      await apiClient.dio.post(
        '/conversations/$_resolvedConversationId/messages',
        data: {'text': text},
      );
      await _loadMessages();
    } on DioException {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('تعذّر إرسال الرسالة.')));
    }
  }

  Future<void> _sendImage() async {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (picked == null || _resolvedConversationId == null) return;
    try {
      final publicUrl = await ref.read(mediaUploadServiceProvider).upload(
            File(picked.path),
            UploadCategory.chatImage,
            contentType: 'image/jpeg',
          );
      final apiClient = ref.read(apiClientProvider);
      await apiClient.dio.post(
        '/conversations/$_resolvedConversationId/messages',
        data: {'imageUrl': publicUrl},
      );
      await _loadMessages();
    } on DioException {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تعذّر إرسال الصورة.')));
    }
  }

  Future<void> _proposePrice(num price) async {
    if (_resolvedConversationId == null) return;
    try {
      final apiClient = ref.read(apiClientProvider);
      await apiClient.dio.post(
        '/conversations/$_resolvedConversationId/offers',
        data: {'price': price},
      );
      if (!mounted) return;
      setState(() => _lastOfferPrice = price);
    } on DioException {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تعذّر إرسال العرض.')));
    }
  }

  Future<void> _promptForPrice() async {
    final controller = TextEditingController();
    final price = await showDialog<num>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('عرض سعر'),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'السعر (ريال)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('إلغاء')),
          FilledButton(
            onPressed: () => Navigator.pop(context, num.tryParse(controller.text.trim())),
            child: const Text('إرسال'),
          ),
        ],
      ),
    );
    if (price != null) await _proposePrice(price);
  }

  Future<void> _acceptOffer() async {
    if (_resolvedConversationId == null) return;
    try {
      final apiClient = ref.read(apiClientProvider);
      await apiClient.dio.post('/conversations/$_resolvedConversationId/offers/accept');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم الاتفاق.')));
    } on DioException {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('لا يوجد عرض لتأكيده بعد.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: const Text('المحادثة')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    if (_error != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('المحادثة')),
        body: Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!))),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('المحادثة')),
      body: Column(
        children: [
          _NegotiationStrip(
            currentPrice: _lastOfferPrice,
            onPropose: _promptForPrice,
            onAccept: _acceptOffer,
          ),
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
                    child: message.imageUrl != null
                        ? ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: Image.network(message.imageUrl!, width: 180, fit: BoxFit.cover),
                          )
                        : Text(message.text),
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
                  IconButton(onPressed: _sendImage, icon: const Icon(Icons.image_outlined)),
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
  const _NegotiationStrip({required this.currentPrice, required this.onPropose, required this.onAccept});

  final num? currentPrice;
  final VoidCallback onPropose;
  final VoidCallback onAccept;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Theme.of(context).colorScheme.secondaryContainer,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Text(currentPrice != null ? 'آخر عرض: $currentPrice ريال' : 'لا يوجد عرض بعد'),
          ),
          TextButton(onPressed: onPropose, child: const Text('عرض سعر')),
          FilledButton(onPressed: onAccept, child: const Text('تم الاتفاق')),
        ],
      ),
    );
  }
}
