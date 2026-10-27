cmake_minimum_required(VERSION 3.22)
project(AncientGrove VERSION 0.1.0 LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
include(FetchContent)
FetchContent_Declare(JUCE GIT_REPOSITORY https://github.com/juce-framework/JUCE.git GIT_TAG 8.0.6 GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(JUCE)
juce_add_plugin(AncientGrove
 COMPANY_NAME "Lion Melody"
 BUNDLE_ID "music.lionmelody.ancientgrove"
 PLUGIN_MANUFACTURER_CODE LmLy
 PLUGIN_CODE Ag01
 FORMATS AU
 PRODUCT_NAME "Ancient Grove"
 IS_SYNTH TRUE
 NEEDS_MIDI_INPUT TRUE
 NEEDS_MIDI_OUTPUT FALSE
 IS_MIDI_EFFECT FALSE
 COPY_PLUGIN_AFTER_BUILD FALSE
 AU_MAIN_TYPE kAudioUnitType_MusicDevice)
target_sources(AncientGrove PRIVATE Plugin.cpp)
target_compile_definitions(AncientGrove PUBLIC JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0)
target_link_libraries(AncientGrove PRIVATE juce::juce_audio_utils juce::juce_dsp PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_warning_flags)
