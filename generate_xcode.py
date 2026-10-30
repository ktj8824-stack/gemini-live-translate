import os
import uuid

def generate_id():
    return uuid.uuid4().hex[:24].upper()

# IDs
proj_id = "111111111111111111111101"
target_id = "111111111111111111111102"
main_group_id = "111111111111111111111103"
app_group_id = "111111111111111111111104"
products_group_id = "111111111111111111111105"

app_ref_id = "111111111111111111111106"
sources_phase_id = "111111111111111111111107"
frameworks_phase_id = "111111111111111111111108"
resources_phase_id = "111111111111111111111109"

proj_cfg_list_id = "111111111111111111111110"
proj_debug_cfg_id = "111111111111111111111111"
proj_release_cfg_id = "111111111111111111111112"

target_cfg_list_id = "111111111111111111111113"
target_debug_cfg_id = "111111111111111111111114"
target_release_cfg_id = "111111111111111111111115"

# File references
app_delegate_ref = "222222222222222222222201"
app_delegate_build = "333333333333333333333301"

scene_delegate_ref = "222222222222222222222202"
scene_delegate_build = "333333333333333333333302"

vc_ref = "222222222222222222222203"
vc_build = "333333333333333333333303"

info_plist_ref = "222222222222222222222204"

assets_ref = "222222222222222222222205"
assets_build = "333333333333333333333305"

www_ref = "222222222222222222222206"
www_build = "333333333333333333333306"

pbxproj_content = f"""// !$*UTF8*$!
{{
	archiveVersion = 1;
	classes = {{
	}};
	objectVersion = 56;
	objects = {{

/* Begin PBXBuildFile section */
		{app_delegate_build} /* AppDelegate.swift in Sources */ = {{isa = PBXBuildFile; fileRef = {app_delegate_ref} /* AppDelegate.swift */; }};
		{scene_delegate_build} /* SceneDelegate.swift in Sources */ = {{isa = PBXBuildFile; fileRef = {scene_delegate_ref} /* SceneDelegate.swift */; }};
		{vc_build} /* ViewController.swift in Sources */ = {{isa = PBXBuildFile; fileRef = {vc_ref} /* ViewController.swift */; }};
		{assets_build} /* Assets.xcassets in Resources */ = {{isa = PBXBuildFile; fileRef = {assets_ref} /* Assets.xcassets */; }};
		{www_build} /* www in Resources */ = {{isa = PBXBuildFile; fileRef = {www_ref} /* www */; }};
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
		{app_ref_id} /* LiveTranslate.app */ = {{isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = LiveTranslate.app; sourceTree = BUILT_PRODUCTS_DIR; }};
		{app_delegate_ref} /* AppDelegate.swift */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = AppDelegate.swift; sourceTree = "<group>"; }};
		{scene_delegate_ref} /* SceneDelegate.swift */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = SceneDelegate.swift; sourceTree = "<group>"; }};
		{vc_ref} /* ViewController.swift */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ViewController.swift; sourceTree = "<group>"; }};
		{info_plist_ref} /* Info.plist */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; }};
		{assets_ref} /* Assets.xcassets */ = {{isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = Assets.xcassets; sourceTree = "<group>"; }};
		{www_ref} /* www */ = {{isa = PBXFileReference; lastKnownFileType = folder; path = www; sourceTree = "<group>"; }};
/* End PBXFileReference section */

/* Begin PBXFrameworksBuildPhase section */
		{frameworks_phase_id} /* Frameworks */ = {{
			isa = PBXFrameworksBuildPhase;
			buildActionMask = 2147483647;
			files = (
			);
			runOnlyForDeploymentPostprocessing = 0;
		}};
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
		{main_group_id} = {{
			isa = PBXGroup;
			children = (
				{app_group_id} /* LiveTranslate */,
				{products_group_id} /* Products */,
			);
			sourceTree = "<group>";
		}};
		{app_group_id} /* LiveTranslate */ = {{
			isa = PBXGroup;
			children = (
				{app_delegate_ref} /* AppDelegate.swift */,
				{scene_delegate_ref} /* SceneDelegate.swift */,
				{vc_ref} /* ViewController.swift */,
				{info_plist_ref} /* Info.plist */,
				{assets_ref} /* Assets.xcassets */,
				{www_ref} /* www */,
			);
			path = LiveTranslate;
			sourceTree = "<group>";
		}};
		{products_group_id} /* Products */ = {{
			isa = PBXGroup;
			children = (
				{app_ref_id} /* LiveTranslate.app */,
			);
			name = Products;
			sourceTree = "<group>";
		}};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
		{target_id} /* LiveTranslate */ = {{
			isa = PBXNativeTarget;
			buildConfigurationList = {target_cfg_list_id} /* Build configuration list for PBXNativeTarget "LiveTranslate" */;
			buildPhases = (
				{sources_phase_id} /* Sources */,
				{frameworks_phase_id} /* Frameworks */,
				{resources_phase_id} /* Resources */,
			);
			buildRules = (
			);
			dependencies = (
			);
			name = LiveTranslate;
			productName = LiveTranslate;
			productReference = {app_ref_id} /* LiveTranslate.app */;
			productType = "com.apple.product-type.application";
		}};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
		{proj_id} /* Project object */ = {{
			isa = PBXProject;
			attributes = {{
				BuildIndependentTargetsInParallel = 1;
				LastSwiftUpdateCheck = 1500;
				LastUpgradeCheck = 1500;
				TargetAttributes = {{
					{target_id} = {{
						CreatedOnToolsVersion = 15.0;
					}};
				}};
			}};
			buildConfigurationList = {proj_cfg_list_id} /* Build configuration list for PBXProject "LiveTranslate" */;
			compatibilityVersion = "Xcode 14.0";
			developmentRegion = en;
			hasScannedForEncodings = 0;
			knownRegions = (
				en,
				Base,
			);
			mainGroup = {main_group_id};
			productRefGroup = {products_group_id} /* Products */;
			projectDirPath = "";
			projectRoot = "";
			targets = (
				{target_id} /* LiveTranslate */,
			);
		}};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
		{resources_phase_id} /* Resources */ = {{
			isa = PBXResourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				{assets_build} /* Assets.xcassets in Resources */,
				{www_build} /* www in Resources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		}};
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
		{sources_phase_id} /* Sources */ = {{
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				{app_delegate_build} /* AppDelegate.swift in Sources */,
				{scene_delegate_build} /* SceneDelegate.swift in Sources */,
				{vc_build} /* ViewController.swift in Sources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		}};
/* End PBXSourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
		{proj_debug_cfg_id} /* Debug */ = {{
			isa = XCBuildConfiguration;
			buildSettings = {{
				ALWAYS_SEARCH_USER_PATHS = NO;
				CLANG_ANALYZER_NONNULL = YES;
				CLANG_ANALYZER_NUMBER_OBJECT_CONVERSION = YES_AGGRESSIVE;
				CLANG_CXX_LANGUAGE_STANDARD = "gnu++20";
				CLANG_ENABLE_MODULES = YES;
				CLANG_ENABLE_OBJC_ARC = YES;
				CLANG_ENABLE_OBJC_WEAK = YES;
				CLANG_WARN_BLOCK_CAPTURE_AUTORELEASING = YES;
				CLANG_WARN_BOOL_CONVERSION = YES;
				CLANG_WARN_COMMA = YES;
				CLANG_WARN_CONSTANT_CONVERSION = YES;
				CLANG_WARN_DEPRECATED_OBJC_IMPLEMENTATIONS = YES;
				CLANG_WARN_DIRECT_OBJC_ISA_USAGE = YES_ERROR;
				CLANG_WARN_DOCUMENTATION_COMMENTS = YES;
				CLANG_WARN_EMPTY_BODY = YES;
				CLANG_WARN_ENUM_CONVERSION = YES;
				CLANG_WARN_INFINITE_RECURSION = YES;
				CLANG_WARN_INT_CONVERSION = YES;
				CLANG_WARN_NON_LITERAL_NULL_CONVERSION = YES;
				CLANG_WARN_OBJC_IMPLICIT_RETAIN_SELF = YES;
				CLANG_WARN_OBJC_LITERAL_CONVERSION = YES;
				CLANG_WARN_OBJC_ROOT_CLASS = YES_ERROR;
				CLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER = YES;
				CLANG_WARN_RANGE_LOOP_ANALYSIS = YES;
				CLANG_WARN_STRICT_PROTOTYPES = YES;
				CLANG_WARN_SUSPICIOUS_MOVE = YES;
				CLANG_WARN_UNGUARDED_AVAILABILITY = YES_AGGRESSIVE;
				CLANG_WARN_UNREACHABLE_CODE = YES;
				CLANG_WARN__DUPLICATE_METHOD_MATCH = YES;
				COPY_PHASE_STRIP = NO;
				DEBUG_INFORMATION_FORMAT = dwarf;
				ENABLE_STRICT_OBJC_MSGSEND = YES;
				ENABLE_TESTABILITY = YES;
				GCC_C_LANGUAGE_STANDARD = gnu11;
				GCC_DYNAMIC_NO_PIC = NO;
				GCC_NO_COMMON_BLOCKS = YES;
				GCC_OPTIMIZATION_LEVEL = 0;
				GCC_PREPROCESSOR_DEFINITIONS = (
					"DEBUG=1",
					"$(inherited)",
				);
				GCC_WARN_64_TO_32_BIT_CONVERSION = YES;
				GCC_WARN_ABOUT_RETURN_TYPE = YES_ERROR;
				GCC_WARN_UNDEFINED_VARIABLES = YES;
				GCC_WARN_UNUSED_FUNCTION = YES;
				GCC_WARN_UNUSED_VARIABLE = YES;
				IPHONEOS_DEPLOYMENT_TARGET = 15.0;
				MTL_ENABLE_DEBUG_INFO = INCLUDE_SOURCE;
				MTL_FAST_MATH = YES;
				ONLY_ACTIVE_ARCH = YES;
				SDKROOT = iphoneos;
				SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;
				SWIFT_OPTIMIZATION_LEVEL = "-Onone";
			}};
			name = Debug;
		}};
		{proj_release_cfg_id} /* Release */ = {{
			isa = XCBuildConfiguration;
			buildSettings = {{
				ALWAYS_SEARCH_USER_PATHS = NO;
				CLANG_ANALYZER_NONNULL = YES;
				CLANG_ANALYZER_NUMBER_OBJECT_CONVERSION = YES_AGGRESSIVE;
				CLANG_CXX_LANGUAGE_STANDARD = "gnu++20";
				CLANG_ENABLE_MODULES = YES;
				CLANG_ENABLE_OBJC_ARC = YES;
				CLANG_ENABLE_OBJC_WEAK = YES;
				CLANG_WARN_BLOCK_CAPTURE_AUTORELEASING = YES;
				CLANG_WARN_BOOL_CONVERSION = YES;
				CLANG_WARN_COMMA = YES;
				CLANG_WARN_CONSTANT_CONVERSION = YES;
				CLANG_WARN_DEPRECATED_OBJC_IMPLEMENTATIONS = YES;
				CLANG_WARN_DIRECT_OBJC_ISA_USAGE = YES_ERROR;
				CLANG_WARN_DOCUMENTATION_COMMENTS = YES;
				CLANG_WARN_EMPTY_BODY = YES;
				CLANG_WARN_ENUM_CONVERSION = YES;
				CLANG_WARN_INFINITE_RECURSION = YES;
				CLANG_WARN_INT_CONVERSION = YES;
				CLANG_WARN_NON_LITERAL_NULL_CONVERSION = YES;
				CLANG_WARN_OBJC_IMPLICIT_RETAIN_SELF = YES;
				CLANG_WARN_OBJC_LITERAL_CONVERSION = YES;
				CLANG_WARN_OBJC_ROOT_CLASS = YES_ERROR;
				CLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER = YES;
				CLANG_WARN_RANGE_LOOP_ANALYSIS = YES;
				CLANG_WARN_STRICT_PROTOTYPES = YES;
				CLANG_WARN_SUSPICIOUS_MOVE = YES;
				CLANG_WARN_UNGUARDED_AVAILABILITY = YES_AGGRESSIVE;
				CLANG_WARN_UNREACHABLE_CODE = YES;
				CLANG_WARN__DUPLICATE_METHOD_MATCH = YES;
				COPY_PHASE_STRIP = NO;
				DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";
				ENABLE_NS_ASSERTIONS = NO;
				ENABLE_STRICT_OBJC_MSGSEND = YES;
				GCC_C_LANGUAGE_STANDARD = gnu11;
				GCC_NO_COMMON_BLOCKS = YES;
				GCC_WARN_64_TO_32_BIT_CONVERSION = YES;
				GCC_WARN_ABOUT_RETURN_TYPE = YES_ERROR;
				GCC_WARN_UNDEFINED_VARIABLES = YES;
				GCC_WARN_UNUSED_FUNCTION = YES;
				GCC_WARN_UNUSED_VARIABLE = YES;
				IPHONEOS_DEPLOYMENT_TARGET = 15.0;
				MTL_ENABLE_DEBUG_INFO = NO;
				MTL_FAST_MATH = YES;
				SDKROOT = iphoneos;
				SWIFT_COMPILATION_MODE = wholemodule;
				SWIFT_OPTIMIZATION_LEVEL = "-O";
				VALIDATE_PRODUCT = YES;
			}};
			name = Release;
		}};
		{target_debug_cfg_id} /* Debug */ = {{
			isa = XCBuildConfiguration;
			buildSettings = {{
				ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
				ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;
				CODE_SIGN_STYLE = Automatic;
				CURRENT_PROJECT_VERSION = 1;
				GENERATE_INFOPLIST_FILE = NO;
				INFOPLIST_FILE = LiveTranslate/Info.plist;
				INFOPLIST_KEY_CFBundleDisplayName = "Live Translate";
				IPHONEOS_DEPLOYMENT_TARGET = 15.0;
				LD_RUNPATH_SEARCH_PATHS = (
					"$(inherited)",
					"@executable_path/Frameworks",
				);
				MARKETING_VERSION = 1.0;
				PRODUCT_BUNDLE_IDENTIFIER = com.translate.LiveTranslate;
				PRODUCT_NAME = "$(TARGET_NAME)";
				SWIFT_EMIT_LOC_STRINGS = YES;
				SWIFT_VERSION = 5.0;
				TARGETED_DEVICE_FAMILY = "1,2";
			}};
			name = Debug;
		}};
		{target_release_cfg_id} /* Release */ = {{
			isa = XCBuildConfiguration;
			buildSettings = {{
				ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
				ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;
				CODE_SIGN_STYLE = Automatic;
				CURRENT_PROJECT_VERSION = 1;
				GENERATE_INFOPLIST_FILE = NO;
				INFOPLIST_FILE = LiveTranslate/Info.plist;
				INFOPLIST_KEY_CFBundleDisplayName = "Live Translate";
				IPHONEOS_DEPLOYMENT_TARGET = 15.0;
				LD_RUNPATH_SEARCH_PATHS = (
					"$(inherited)",
					"@executable_path/Frameworks",
				);
				MARKETING_VERSION = 1.0;
				PRODUCT_BUNDLE_IDENTIFIER = com.translate.LiveTranslate;
				PRODUCT_NAME = "$(TARGET_NAME)";
				SWIFT_EMIT_LOC_STRINGS = YES;
				SWIFT_VERSION = 5.0;
				TARGETED_DEVICE_FAMILY = "1,2";
			}};
			name = Release;
		}};
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
		{proj_cfg_list_id} /* Build configuration list for PBXProject "LiveTranslate" */ = {{
			isa = XCConfigurationList;
			buildConfigurations = (
				{proj_debug_cfg_id} /* Debug */,
				{proj_release_cfg_id} /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		}};
		{target_cfg_list_id} /* Build configuration list for PBXNativeTarget "LiveTranslate" */ = {{
			isa = XCConfigurationList;
			buildConfigurations = (
				{target_debug_cfg_id} /* Debug */,
				{target_release_cfg_id} /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		}};
/* End XCConfigurationList section */
	}};
	rootObject = {proj_id} /* Project object */;
}}
"""

os.makedirs("ios/LiveTranslate.xcodeproj", exist_ok=True)
with open("ios/LiveTranslate.xcodeproj/project.pbxproj", "w", encoding="utf-8") as f:
    f.write(pbxproj_content)

print("✅ LiveTranslate.xcodeproj successfully created!")
