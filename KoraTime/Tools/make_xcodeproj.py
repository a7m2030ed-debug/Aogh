#!/usr/bin/env python3
"""يولّد KoraTime.xcodeproj/project.pbxproj من محتويات مجلد KoraTime/.

شغّله بعد إضافة أو حذف أي ملف داخل KoraTime/ ليُحدَّث المشروع:

    python3 Tools/make_xcodeproj.py

المعرّفات مشتقّة من مسار كل ملف (SHA-1)، فالناتج ثابت لا يتغيّر بين التشغيلات
وبالتالي لا يُحدث ضجيجاً في git.
"""

import hashlib
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = "KoraTime"
SOURCE_DIR = os.path.join(ROOT, APP)
PROJECT_DIR = os.path.join(ROOT, f"{APP}.xcodeproj")

BUNDLE_ID = "com.koratime.app"
DEPLOYMENT_TARGET = "17.0"

SOURCE_EXTENSIONS = {".swift"}
RESOURCE_EXTENSIONS = {".json", ".xcassets", ".strings", ".ttf", ".otf", ".png", ".xcprivacy"}
# يُشار إليه في المشروع لكنه لا يدخل مرحلة النسخ (يُستخدم عبر INFOPLIST_FILE)
EXCLUDED_FROM_BUILD = {"Info.plist"}
SKIP_NAMES = {".DS_Store"}


def uid(seed):
    return hashlib.sha1(seed.encode("utf-8")).hexdigest()[:24].upper()


def file_type(name):
    if name.endswith(".swift"):
        return "sourcecode.swift"
    if name.endswith(".xcassets"):
        return "folder.assetcatalog"
    if name.endswith(".json"):
        return "text.json"
    if name.endswith(".plist"):
        return "text.plist.xml"
    if name.endswith(".png"):
        return "image.png"
    if name.endswith(".strings"):
        return "text.plist.strings"
    return "text"


class Node:
    """مجلد داخل شجرة المشروع."""

    def __init__(self, name, path):
        self.name = name
        self.path = path          # نسبي إلى جذر المستودع
        self.children = []        # Node
        self.files = []           # (name, relative path)


def build_tree(directory, relative):
    node = Node(os.path.basename(directory), relative)
    for entry in sorted(os.listdir(directory)):
        if entry in SKIP_NAMES:
            continue
        full = os.path.join(directory, entry)
        child_relative = os.path.join(relative, entry) if relative else entry
        extension = os.path.splitext(entry)[1]
        if os.path.isdir(full) and extension not in RESOURCE_EXTENSIONS:
            node.children.append(build_tree(full, child_relative))
        else:
            node.files.append((entry, child_relative))
    return node


def collect(node, sources, resources):
    for name, relative in node.files:
        extension = os.path.splitext(name)[1]
        if name in EXCLUDED_FROM_BUILD:
            continue
        if extension in SOURCE_EXTENSIONS:
            sources.append(relative)
        elif extension in RESOURCE_EXTENSIONS:
            resources.append(relative)
    for child in node.children:
        collect(child, sources, resources)


def emit_groups(node, lines):
    """يكتب PBXGroup لهذا المجلد وكل ما تحته."""
    for child in node.children:
        emit_groups(child, lines)

    children_refs = []
    for child in node.children:
        children_refs.append(f"\t\t\t\t{uid('group:' + child.path)} /* {child.name} */,")
    for name, relative in node.files:
        children_refs.append(f"\t\t\t\t{uid('file:' + relative)} /* {name} */,")

    lines.append(f"\t\t{uid('group:' + node.path)} /* {node.name} */ = {{")
    lines.append("\t\t\tisa = PBXGroup;")
    lines.append("\t\t\tchildren = (")
    lines.extend(children_refs)
    lines.append("\t\t\t);")
    lines.append(f"\t\t\tpath = {node.name};")
    lines.append('\t\t\tsourceTree = "<group>";')
    lines.append("\t\t};")


def emit_file_references(node, lines):
    for name, relative in node.files:
        lines.append(
            f"\t\t{uid('file:' + relative)} /* {name} */ = {{isa = PBXFileReference; "
            f'lastKnownFileType = {file_type(name)}; path = "{name}"; sourceTree = "<group>"; }};'
        )
    for child in node.children:
        emit_file_references(child, lines)


def main():
    tree = build_tree(SOURCE_DIR, APP)

    sources, resources = [], []
    collect(tree, sources, resources)

    target_id = uid("target")
    product_id = uid("product")
    project_id = uid("project")
    main_group_id = uid("group:__main__")
    products_group_id = uid("group:__products__")
    sources_phase_id = uid("phase:sources")
    frameworks_phase_id = uid("phase:frameworks")
    resources_phase_id = uid("phase:resources")
    project_config_list = uid("configlist:project")
    target_config_list = uid("configlist:target")
    project_debug = uid("config:project:debug")
    project_release = uid("config:project:release")
    target_debug = uid("config:target:debug")
    target_release = uid("config:target:release")

    out = []
    add = out.append

    add("// !$*UTF8*$!")
    add("{")
    add("\tarchiveVersion = 1;")
    add("\tclasses = {")
    add("\t};")
    add("\tobjectVersion = 56;")
    add("\tobjects = {")
    add("")

    # PBXBuildFile
    add("/* Begin PBXBuildFile section */")
    for relative in sources + resources:
        name = os.path.basename(relative)
        add(
            f"\t\t{uid('build:' + relative)} /* {name} in "
            f"{'Sources' if relative in sources else 'Resources'} */ = {{isa = PBXBuildFile; "
            f"fileRef = {uid('file:' + relative)} /* {name} */; }};"
        )
    add("/* End PBXBuildFile section */")
    add("")

    # PBXFileReference
    add("/* Begin PBXFileReference section */")
    add(
        f"\t\t{product_id} /* {APP}.app */ = {{isa = PBXFileReference; "
        f"explicitFileType = wrapper.application; includeInIndex = 0; "
        f"path = {APP}.app; sourceTree = BUILT_PRODUCTS_DIR; }};"
    )
    emit_file_references(tree, out)
    add("/* End PBXFileReference section */")
    add("")

    # PBXFrameworksBuildPhase
    add("/* Begin PBXFrameworksBuildPhase section */")
    add(f"\t\t{frameworks_phase_id} /* Frameworks */ = {{")
    add("\t\t\tisa = PBXFrameworksBuildPhase;")
    add("\t\t\tbuildActionMask = 2147483647;")
    add("\t\t\tfiles = (")
    add("\t\t\t);")
    add("\t\t\trunOnlyForDeploymentPostprocessing = 0;")
    add("\t\t};")
    add("/* End PBXFrameworksBuildPhase section */")
    add("")

    # PBXGroup
    add("/* Begin PBXGroup section */")
    add(f"\t\t{main_group_id} = {{")
    add("\t\t\tisa = PBXGroup;")
    add("\t\t\tchildren = (")
    add(f"\t\t\t\t{uid('group:' + APP)} /* {APP} */,")
    add(f"\t\t\t\t{products_group_id} /* Products */,")
    add("\t\t\t);")
    add('\t\t\tsourceTree = "<group>";')
    add("\t\t};")
    add(f"\t\t{products_group_id} /* Products */ = {{")
    add("\t\t\tisa = PBXGroup;")
    add("\t\t\tchildren = (")
    add(f"\t\t\t\t{product_id} /* {APP}.app */,")
    add("\t\t\t);")
    add("\t\t\tname = Products;")
    add('\t\t\tsourceTree = "<group>";')
    add("\t\t};")
    emit_groups(tree, out)
    add("/* End PBXGroup section */")
    add("")

    # PBXNativeTarget
    add("/* Begin PBXNativeTarget section */")
    add(f"\t\t{target_id} /* {APP} */ = {{")
    add("\t\t\tisa = PBXNativeTarget;")
    add(f'\t\t\tbuildConfigurationList = {target_config_list} /* Build configuration list for PBXNativeTarget "{APP}" */;')
    add("\t\t\tbuildPhases = (")
    add(f"\t\t\t\t{sources_phase_id} /* Sources */,")
    add(f"\t\t\t\t{frameworks_phase_id} /* Frameworks */,")
    add(f"\t\t\t\t{resources_phase_id} /* Resources */,")
    add("\t\t\t);")
    add("\t\t\tbuildRules = (")
    add("\t\t\t);")
    add("\t\t\tdependencies = (")
    add("\t\t\t);")
    add(f"\t\t\tname = {APP};")
    add(f"\t\t\tproductName = {APP};")
    add(f"\t\t\tproductReference = {product_id} /* {APP}.app */;")
    add('\t\t\tproductType = "com.apple.product-type.application";')
    add("\t\t};")
    add("/* End PBXNativeTarget section */")
    add("")

    # PBXProject
    add("/* Begin PBXProject section */")
    add(f"\t\t{project_id} /* Project object */ = {{")
    add("\t\t\tisa = PBXProject;")
    add("\t\t\tattributes = {")
    add("\t\t\t\tBuildIndependentTargetsInParallel = 1;")
    add("\t\t\t\tLastSwiftUpdateCheck = 1600;")
    add("\t\t\t\tLastUpgradeCheck = 1600;")
    add("\t\t\t\tTargetAttributes = {")
    add(f"\t\t\t\t\t{target_id} = {{")
    add("\t\t\t\t\t\tCreatedOnToolsVersion = 16.0;")
    add("\t\t\t\t\t};")
    add("\t\t\t\t};")
    add("\t\t\t};")
    add(f'\t\t\tbuildConfigurationList = {project_config_list} /* Build configuration list for PBXProject "{APP}" */;')
    add('\t\t\tcompatibilityVersion = "Xcode 14.0";')
    add("\t\t\tdevelopmentRegion = ar;")
    add("\t\t\thasScannedForEncodings = 0;")
    add("\t\t\tknownRegions = (")
    add("\t\t\t\tar,")
    add("\t\t\t\tBase,")
    add("\t\t\t);")
    add(f"\t\t\tmainGroup = {main_group_id};")
    add(f"\t\t\tproductRefGroup = {products_group_id} /* Products */;")
    add('\t\t\tprojectDirPath = "";')
    add('\t\t\tprojectRoot = "";')
    add("\t\t\ttargets = (")
    add(f"\t\t\t\t{target_id} /* {APP} */,")
    add("\t\t\t);")
    add("\t\t};")
    add("/* End PBXProject section */")
    add("")

    # PBXResourcesBuildPhase
    add("/* Begin PBXResourcesBuildPhase section */")
    add(f"\t\t{resources_phase_id} /* Resources */ = {{")
    add("\t\t\tisa = PBXResourcesBuildPhase;")
    add("\t\t\tbuildActionMask = 2147483647;")
    add("\t\t\tfiles = (")
    for relative in resources:
        name = os.path.basename(relative)
        add(f"\t\t\t\t{uid('build:' + relative)} /* {name} in Resources */,")
    add("\t\t\t);")
    add("\t\t\trunOnlyForDeploymentPostprocessing = 0;")
    add("\t\t};")
    add("/* End PBXResourcesBuildPhase section */")
    add("")

    # PBXSourcesBuildPhase
    add("/* Begin PBXSourcesBuildPhase section */")
    add(f"\t\t{sources_phase_id} /* Sources */ = {{")
    add("\t\t\tisa = PBXSourcesBuildPhase;")
    add("\t\t\tbuildActionMask = 2147483647;")
    add("\t\t\tfiles = (")
    for relative in sources:
        name = os.path.basename(relative)
        add(f"\t\t\t\t{uid('build:' + relative)} /* {name} in Sources */,")
    add("\t\t\t);")
    add("\t\t\trunOnlyForDeploymentPostprocessing = 0;")
    add("\t\t};")
    add("/* End PBXSourcesBuildPhase section */")
    add("")

    shared_project_settings = [
        "ALWAYS_SEARCH_USER_PATHS = NO;",
        "CLANG_ANALYZER_NONNULL = YES;",
        "CLANG_ANALYZER_NUMBER_OBJECT_CONVERSION = YES_AGGRESSIVE;",
        'CLANG_CXX_LANGUAGE_STANDARD = "gnu++20";',
        "CLANG_ENABLE_MODULES = YES;",
        "CLANG_ENABLE_OBJC_ARC = YES;",
        "CLANG_ENABLE_OBJC_WEAK = YES;",
        "CLANG_WARN_BLOCK_CAPTURE_AUTORELEASING = YES;",
        "CLANG_WARN_BOOL_CONVERSION = YES;",
        "CLANG_WARN_COMMA = YES;",
        "CLANG_WARN_CONSTANT_CONVERSION = YES;",
        "CLANG_WARN_DEPRECATED_OBJC_IMPLEMENTATIONS = YES;",
        "CLANG_WARN_DIRECT_OBJC_ISA_USAGE = YES_ERROR;",
        "CLANG_WARN_DOCUMENTATION_COMMENTS = YES;",
        "CLANG_WARN_EMPTY_BODY = YES;",
        "CLANG_WARN_ENUM_CONVERSION = YES;",
        "CLANG_WARN_INFINITE_RECURSION = YES;",
        "CLANG_WARN_INT_CONVERSION = YES;",
        "CLANG_WARN_NON_LITERAL_NULL_CONVERSION = YES;",
        "CLANG_WARN_OBJC_IMPLICIT_RETAIN_SELF = YES;",
        "CLANG_WARN_OBJC_LITERAL_CONVERSION = YES;",
        "CLANG_WARN_OBJC_ROOT_CLASS = YES_ERROR;",
        "CLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER = YES;",
        "CLANG_WARN_RANGE_LOOP_ANALYSIS = YES;",
        "CLANG_WARN_STRICT_PROTOTYPES = YES;",
        "CLANG_WARN_SUSPICIOUS_MOVE = YES;",
        "CLANG_WARN_UNGUARDED_AVAILABILITY = YES_AGGRESSIVE;",
        "CLANG_WARN_UNREACHABLE_CODE = YES;",
        "CLANG_WARN__DUPLICATE_METHOD_MATCH = YES;",
        "COPY_PHASE_STRIP = NO;",
        "ENABLE_STRICT_OBJC_MSGSEND = YES;",
        "GCC_C_LANGUAGE_STANDARD = gnu17;",
        "GCC_NO_COMMON_BLOCKS = YES;",
        "GCC_WARN_64_TO_32_BIT_CONVERSION = YES;",
        "GCC_WARN_ABOUT_RETURN_TYPE = YES_ERROR;",
        "GCC_WARN_UNDECLARED_SELECTOR = YES;",
        "GCC_WARN_UNINITIALIZED_AUTOS = YES_AGGRESSIVE;",
        "GCC_WARN_UNUSED_FUNCTION = YES;",
        "GCC_WARN_UNUSED_VARIABLE = YES;",
        f"IPHONEOS_DEPLOYMENT_TARGET = {DEPLOYMENT_TARGET};",
        "MTL_FAST_MATH = YES;",
        "SDKROOT = iphoneos;",
    ]

    debug_only = [
        "DEBUG_INFORMATION_FORMAT = dwarf;",
        "ENABLE_TESTABILITY = YES;",
        "GCC_DYNAMIC_NO_PIC = NO;",
        "GCC_OPTIMIZATION_LEVEL = 0;",
        "GCC_PREPROCESSOR_DEFINITIONS = (\n\t\t\t\t\t\"DEBUG=1\",\n\t\t\t\t\t\"$(inherited)\",\n\t\t\t\t);",
        "MTL_ENABLE_DEBUG_INFO = INCLUDE_SOURCE;",
        "ONLY_ACTIVE_ARCH = YES;",
        'SWIFT_ACTIVE_COMPILATION_CONDITIONS = "DEBUG $(inherited)";',
        'SWIFT_OPTIMIZATION_LEVEL = "-Onone";',
    ]

    release_only = [
        'DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";',
        "ENABLE_NS_ASSERTIONS = NO;",
        "MTL_ENABLE_DEBUG_INFO = NO;",
        "SWIFT_COMPILATION_MODE = wholemodule;",
        "VALIDATE_PRODUCT = YES;",
    ]

    target_settings = [
        "ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;",
        "ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;",
        "CODE_SIGN_STYLE = Automatic;",
        "CURRENT_PROJECT_VERSION = 1;",
        'DEVELOPMENT_TEAM = "";',
        "ENABLE_PREVIEWS = YES;",
        "GENERATE_INFOPLIST_FILE = NO;",
        f"INFOPLIST_FILE = {APP}/Info.plist;",
        'LD_RUNPATH_SEARCH_PATHS = (\n\t\t\t\t\t"$(inherited)",\n\t\t\t\t\t"@executable_path/Frameworks",\n\t\t\t\t);',
        "MARKETING_VERSION = 1.0;",
        f"PRODUCT_BUNDLE_IDENTIFIER = {BUNDLE_ID};",
        'PRODUCT_NAME = "$(TARGET_NAME)";',
        "SWIFT_EMIT_LOC_STRINGS = YES;",
        "SWIFT_STRICT_CONCURRENCY = minimal;",
        "SWIFT_VERSION = 5.0;",
        'TARGETED_DEVICE_FAMILY = "1,2";',
    ]

    def emit_config(identifier, name, settings):
        add(f"\t\t{identifier} /* {name} */ = {{")
        add("\t\t\tisa = XCBuildConfiguration;")
        add("\t\t\tbuildSettings = {")
        for setting in settings:
            add(f"\t\t\t\t{setting}")
        add("\t\t\t};")
        add(f"\t\t\tname = {name};")
        add("\t\t};")

    add("/* Begin XCBuildConfiguration section */")
    emit_config(project_debug, "Debug", sorted(shared_project_settings + debug_only))
    emit_config(project_release, "Release", sorted(shared_project_settings + release_only))
    emit_config(target_debug, "Debug", target_settings)
    emit_config(target_release, "Release", target_settings)
    add("/* End XCBuildConfiguration section */")
    add("")

    add("/* Begin XCConfigurationList section */")
    for identifier, label, debug, release in [
        (project_config_list, f'Build configuration list for PBXProject "{APP}"', project_debug, project_release),
        (target_config_list, f'Build configuration list for PBXNativeTarget "{APP}"', target_debug, target_release),
    ]:
        add(f"\t\t{identifier} /* {label} */ = {{")
        add("\t\t\tisa = XCConfigurationList;")
        add("\t\t\tbuildConfigurations = (")
        add(f"\t\t\t\t{debug} /* Debug */,")
        add(f"\t\t\t\t{release} /* Release */,")
        add("\t\t\t);")
        add("\t\t\tdefaultConfigurationIsVisible = 0;")
        add("\t\t\tdefaultConfigurationName = Release;")
        add("\t\t};")
    add("/* End XCConfigurationList section */")
    add("\t};")
    add(f"\trootObject = {project_id} /* Project object */;")
    add("}")
    add("")

    os.makedirs(PROJECT_DIR, exist_ok=True)
    destination = os.path.join(PROJECT_DIR, "project.pbxproj")
    with open(destination, "w", encoding="utf-8") as handle:
        handle.write("\n".join(out))

    # المخطط المشترك يحتاج معرّف الهدف نفسه
    schemes_dir = os.path.join(PROJECT_DIR, "xcshareddata", "xcschemes")
    os.makedirs(schemes_dir, exist_ok=True)
    scheme_path = os.path.join(schemes_dir, f"{APP}.xcscheme")
    with open(scheme_path, "w", encoding="utf-8") as handle:
        handle.write(SCHEME_TEMPLATE.format(app=APP, target=target_id))

    print(f"wrote {destination}")
    print(f"  {len(sources)} sources, {len(resources)} resources")
    print(f"wrote {scheme_path}")


SCHEME_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<Scheme
   LastUpgradeVersion = "1600"
   version = "1.7">
   <BuildAction
      parallelizeBuildables = "YES"
      buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "YES"
            buildForArchiving = "YES"
            buildForAnalyzing = "YES">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "{target}"
               BuildableName = "{app}.app"
               BlueprintName = "{app}"
               ReferencedContainer = "container:{app}.xcodeproj">
            </BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      shouldUseLaunchSchemeArgsEnv = "YES">
      <Testables>
      </Testables>
   </TestAction>
   <LaunchAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "{target}"
            BuildableName = "{app}.app"
            BlueprintName = "{app}"
            ReferencedContainer = "container:{app}.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction
      buildConfiguration = "Release"
      shouldUseLaunchSchemeArgsEnv = "YES"
      savedToolIdentifier = ""
      useCustomWorkingDirectory = "NO"
      debugDocumentVersioning = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "{target}"
            BuildableName = "{app}.app"
            BlueprintName = "{app}"
            ReferencedContainer = "container:{app}.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction
      buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction
      buildConfiguration = "Release"
      revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
"""


if __name__ == "__main__":
    main()
