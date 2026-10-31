#!/usr/bin/env ruby
# 3.7.22 i18n: registers every UI language of src/i18n/locales.json with App.xcodeproj
# (knownRegions + App/<lproj>/InfoPlist.strings in the existing InfoPlist.strings
# variant group, which the App target already copies as a resource). The .lproj
# folder names come from src/i18n/locales.meta.json ("ios"). Idempotent: running it
# again changes nothing. Run from frontend/ios: ruby scripts/add-localizations.rb
# (needs `gem install xcodeproj`).
require "json"
require "xcodeproj"

root = File.expand_path("../App", __dir__)
meta_path = File.expand_path("../../src/i18n/locales.meta.json", __dir__)
lprojs = JSON.parse(File.read(meta_path))["locales"].values.map { |l| l["ios"] }.compact.uniq

project = Xcodeproj::Project.open(File.join(root, "App.xcodeproj"))
changes = []

regions = project.root_object.known_regions
lprojs.each do |id|
  next if regions.include?(id)
  # Keep "Base" last, like Xcode does.
  base_at = regions.index("Base")
  base_at ? regions.insert(base_at, id) : regions << id
  changes << "knownRegions +#{id}"
end

variant = project.objects.find { |o| o.isa == "PBXVariantGroup" && o.name == "InfoPlist.strings" } or abort("InfoPlist.strings variant group missing")
lprojs.each do |id|
  path = "#{id}.lproj/InfoPlist.strings"
  abort("missing App/App/#{path}") unless File.exist?(File.join(root, "App", path))
  next if variant.children.any? { |c| c.path == path }
  ref = project.new(Xcodeproj::Project::Object::PBXFileReference)
  ref.name = id
  ref.path = path
  ref.last_known_file_type = "text.plist.strings"
  ref.source_tree = "<group>"
  variant.children << ref
  changes << "InfoPlist.strings +#{id}"
end

if changes.empty?
  puts "Localizations already registered (#{lprojs.join(', ')})"
else
  project.save
  puts changes.join("\n")
end
