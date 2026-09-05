import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/api/api_client.dart';
import '../../core/api/media_upload_service.dart';
import '../../core/session/current_user.dart';

class ChatMessage {
  const ChatMessage({required this.text, required this.senderType, this.imageUrl});

  final String text;
  final String senderType;
  final String? imageUrl;

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        text: json['text'] as String? ?? '',
        senderType: json['senderType'] as String? ?? 'USER',
        imageUrl: json['imageUrl'] as String?,
      );
}

/// Plain chat between a customer and a dealer who answered their request.
/// No price, no offers, no "confirm the deal" — the platform introduced the
/// two of them and stays out of the rest (client decision, 2026-09-05).
///
/// Conversations are never created here: a dealer answering a request is
/// what creates one, so this screen always opens on an existing id.
class ConversationScreen extends ConsumerStatefulWidget {
  const ConversationScreen({super.key, required this.conversationId});

  final String conversationId;

  @override
  ConsumerState<ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends ConsumerState<ConversationScreen> {
  final _controller = TextEditingController();
  List<ChatMessage> _messages = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadMessages();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _loadMessages() async {
    try {
      final response = await ref
          .read(apiClientProvider)
          .dio
          .get('/conversations/${widget.conversationId}/messages');
      if (!mounted) return;
      setState(() {
        _messages = (response.data as List)
            .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
            .toList();
        _loading = false;
      });
    } on DioException {
      if (!mounted) return;
      setState(() {
        _error = 'تعذّر فتح المحادثة. تأكد من تسجيل الدخول والاتصال بالخادم.';
        _loading = false;
      });
    }
  }

  // The POST returns the created message, so it's appended straight to
  // the list rather than re-downloading the whole thread after every
  // send — the sent message appears immediately and the cost of sending
  // stops growing with the length of the conversation.
  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    _controller.clear();
    try {
      final response = await ref
          .read(apiClientProvider)
          .dio
          .post('/conversations/${widget.conversationId}/messages', data: {'text': text});
      if (!mounted) return;
      setState(() => _messages = [
            ..._messages,
            ChatMessage.fromJson(response.data as Map<String, dynamic>),
          ]);
    } on DioException {
      if (!mounted) return;
      _controller.text = text; // don't lose what they typed
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('تعذّر إرسال الرسالة.')));
    }
  }

  Future<void> _sendImage() async {
    final picked =
        await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (picked == null) return;
    try {
      final publicUrl = await ref.read(mediaUploadServiceProvider).upload(
            File(picked.path),
            UploadCategory.chatImage,
            contentType: 'image/jpeg',
          );
      final response = await ref
          .read(apiClientProvider)
          .dio
          .post('/conversations/${widget.conversationId}/messages',
              data: {'imageUrl': publicUrl});
      if (!mounted) return;
      setState(() => _messages = [
            ..._messages,
            ChatMessage.fromJson(response.data as Map<String, dynamic>),
          ]);
    } on DioException {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('تعذّر إرسال الصورة.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    // Which side "me" is on depends on who's logged in — the same thread
    // renders mirrored for the customer and the dealer.
    final isDealer = ref.watch(currentUserProvider).valueOrNull?.isDealer ?? false;
    final mySenderType = isDealer ? 'DEALER' : 'USER';

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
          Expanded(
            child: _messages.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Text(
                        isDealer
                            ? 'اكتب للعميل إن القطعة عندك.'
                            : 'التاجر يقول إن القطعة عنده — ابدأ المحادثة.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                    ),
                  )
                : ListView.builder(
                    reverse: true,
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length,
                    itemBuilder: (context, i) {
                      final message = _messages[_messages.length - 1 - i];
                      final fromMe = message.senderType == mySenderType;
                      return Align(
                        alignment: fromMe ? Alignment.centerLeft : Alignment.centerRight,
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          decoration: BoxDecoration(
                            color: fromMe
                                ? Theme.of(context).colorScheme.primaryContainer
                                : Theme.of(context).colorScheme.surfaceContainerHighest,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: message.imageUrl != null
                              ? ClipRRect(
                                  borderRadius: BorderRadius.circular(10),
                                  child: Image.network(message.imageUrl!,
                                      width: 180, fit: BoxFit.cover),
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
