.PHONY: build package
default: package

# Upload-ready zip for Zid: the compiled CSS/JS are included (they are
# gitignored, so the zip must be built from a working tree after
# `npm run build`); dev-only files are left out.
package:
	mkdir -p build
	rm -f build/naseej-theme.zip
	zip -qr build/naseej-theme.zip . \
		-x 'node_modules/*' 'build/*' 'tests/*' 'test-results/*' 'playwright-report/*' \
		   '.vitrin/*' '*.zip' '*.DS_Store' 'playwright.config.js' 'package-lock.json'
	@echo "build/naseej-theme.zip"

build: package
