#!/usr/bin/env ruby
# 3.7.17: adds the Apple Watch app (DescallWatch) to App.xcodeproj, embedded in App.app
# (Watch/DescallWatch.app). Idempotent: does nothing when the target exists.
# Run from frontend/ios: ruby scripts/add-watch-target.rb (needs `gem install xcodeproj`).
require "xcodeproj"

root = File.expand_path("../App", __dir__)
project = Xcodeproj::Project.open(File.join(root, "App.xcodeproj"))
existing = project.targets.find { |t| t.name == "DescallWatch" }
if existing
  # Target present: add any new DescallWatch/*.swift file to its sources (idempotent).
  group = project.main_group.find_subpath("DescallWatch", false)
  have = existing.source_build_phase.files.map { |f| f.file_ref&.path }.compact
  added = []
  Dir.glob(File.join(root, "DescallWatch", "*.swift")).sort.each do |file|
    name = File.basename(file)
    next if have.include?(name)
    ref = group.files.find { |f| f.path == name } || group.new_reference(name)
    existing.add_file_references([ref])
    added << name
  end
  project.save if added.any?
  puts added.any? ? "DescallWatch: added #{added.join(', ')}" : "DescallWatch target already present"
  exit 0
end

app = project.targets.find { |t| t.name == "App" } or abort("App target missing")
app_release = app.build_configurations.find { |c| c.name == "Release" }.build_settings
team = app_release["DEVELOPMENT_TEAM"]
marketing = app_release["MARKETING_VERSION"]
build_number = app_release["CURRENT_PROJECT_VERSION"] || "1"

# Groups and files
main = project.main_group
watch_group = main.find_subpath("DescallWatch", true)
watch_group.set_source_tree("<group>")
watch_group.set_path("DescallWatch")
shared_group = main.find_subpath("WatchShared", true)
shared_group.set_source_tree("<group>")
shared_group.set_path("WatchShared")
app_group = main.children.find { |g| g.respond_to?(:path) && g.path == "App" } or abort("App group missing")

watch_sources = %w[DescallWatchApp.swift WatchClient.swift WatchDemo.swift WatchModels.swift WatchStore.swift WatchStrings.swift WatchTheme.swift WatchViews.swift]
watch_refs = watch_sources.map { |f| watch_group.new_reference(f) }
assets_ref = watch_group.new_reference("Assets.xcassets")
watch_group.new_reference("Info.plist")
protocol_ref = shared_group.new_reference("DescallWatchProtocol.swift")
bridge_ref = app_group.new_reference("DescallWatchBridge.swift")

# Target
watch = project.new_target(:application, "DescallWatch", :watchos, "10.0", nil, :swift)
watch.add_file_references(watch_refs + [protocol_ref])
watch.add_resources([assets_ref])
watch.build_configurations.each do |c|
  s = c.build_settings
  s["PRODUCT_BUNDLE_IDENTIFIER"] = "com.descall.app.watchkitapp"
  s["PRODUCT_NAME"] = "$(TARGET_NAME)"
  s["INFOPLIST_FILE"] = "DescallWatch/Info.plist"
  s["GENERATE_INFOPLIST_FILE"] = "NO"
  s["ASSETCATALOG_COMPILER_APPICON_NAME"] = "AppIcon"
  s["ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME"] = "AccentColor"
  s["SWIFT_VERSION"] = "5.0"
  s["SDKROOT"] = "watchos"
  s["TARGETED_DEVICE_FAMILY"] = "4"
  s["WATCHOS_DEPLOYMENT_TARGET"] = "10.0"
  s["SKIP_INSTALL"] = "YES"
  s["MARKETING_VERSION"] = marketing
  s["CURRENT_PROJECT_VERSION"] = build_number
  s["CODE_SIGN_STYLE"] = "Automatic"
  s["DEVELOPMENT_TEAM"] = team if team
  s["ENABLE_PREVIEWS"] = "NO"
  s["SWIFT_EMIT_LOC_STRINGS"] = "NO"
  s["LD_RUNPATH_SEARCH_PATHS"] = ["$(inherited)", "@executable_path/Frameworks"]
end

# iPhone side: bridge + shared protocol, then embed the watch app.
app.add_file_references([bridge_ref, protocol_ref])
app.add_dependency(watch)
embed = app.new_copy_files_build_phase("Embed Watch Content")
embed.symbol_dst_subfolder_spec = :products_directory
embed.dst_path = "$(CONTENTS_FOLDER_PATH)/Watch"
build_file = embed.add_file_reference(watch.product_reference, true)
build_file.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }

project.save

scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(watch)
scheme.set_launch_target(watch)
scheme.save_as(project.path, "DescallWatch", true)
puts "DescallWatch target added (#{marketing}, team #{team ? 'set' : 'none'})"
