/// Points at the local NestJS backend (../backend) by default. Override
/// with --dart-define=API_BASE_URL=... when running against a deployed
/// environment.
class AppConfig {
  AppConfig._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000/api/v1',
  );
}
