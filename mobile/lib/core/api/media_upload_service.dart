import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client.dart';

enum UploadCategory { listingPhoto, listingVideo, dealerDocument, chatImage }

extension on UploadCategory {
  String get wireValue => switch (this) {
        UploadCategory.listingPhoto => 'listing-photo',
        UploadCategory.listingVideo => 'listing-video',
        UploadCategory.dealerDocument => 'dealer-document',
        UploadCategory.chatImage => 'chat-image',
      };
}

/// Matches backend/src/modules/media: request a short-lived presigned PUT
/// URL, upload the file straight to storage, get back the permanent public
/// URL. This is the one place both the AI-recognition flow
/// (image_search_screen.dart, add_listing_screen.dart) and dealer
/// verification uploads should go through.
class MediaUploadService {
  MediaUploadService(this._apiClient);
  final ApiClient _apiClient;

  Future<String> upload(File file, UploadCategory category, {required String contentType}) async {
    final presign = await _apiClient.dio.post(
      '/media/uploads/presign',
      data: {'category': category.wireValue, 'contentType': contentType},
    );
    final uploadUrl = presign.data['uploadUrl'] as String;
    final publicUrl = presign.data['publicUrl'] as String;

    await _apiClient.dio.put(
      uploadUrl,
      data: file.openRead(),
      options: Options(
        headers: {
          'Content-Type': contentType,
          Headers.contentLengthHeader: await file.length(),
        },
      ),
    );

    return publicUrl;
  }
}

final mediaUploadServiceProvider = Provider((ref) {
  return MediaUploadService(ref.read(apiClientProvider));
});
