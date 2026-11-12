#!/usr/bin/env bash
# Exit 1 while a card with its radii as percentages casts another elevation shadow than with the same radii in dp on
# the attached Android device, 0 once each card casts the same one, 2 when another step fails.
# Needs adb with one Android 11+ device attached (ANDROID_SERIAL picks one of several), node, yarn and a JDK.
set -u

package=com.reproducerapp
equal_card_label="card with four equal radii"
uneven_card_label="card with uneven radii"
dp_label="radii in dp"
percentage_label="radii as percentages"
# Room around each card for its shadow, short of the other card and the button.
shadow_margin_dp=48

fail_step() {
    echo "step failed: $1"
    exit 2
}

# The path as the platform's own programs take it: Git Bash's /c/... becomes C:/... for node on Windows.
native_path() {
    if command -v cygpath > /dev/null; then
        cygpath -m "$1"
    else
        printf '%s\n' "$1"
    fi
}

# Sets the named variable to a device property, without the carriage return adb's shell ends it with.
read_device_property() {
    local value
    value="$(adb shell getprop "$2")" || fail_step "adb shell getprop $2: ${value}"
    printf -v "$1" '%s' "${value//$'\r'/}"
}

dump_window() {
    adb shell uiautomator dump /sdcard/elevation-reproducer.xml > /dev/null 2>&1
    adb exec-out cat /sdcard/elevation-reproducer.xml > "$1" 2> /dev/null
    adb shell rm -f /sdcard/elevation-reproducer.xml
}

wait_for_label() {
    local hierarchy=$1 label=$2 attempt
    for ((attempt = 1; attempt <= 30; attempt += 1)); do
        dump_window "${hierarchy}"
        if grep -qF "content-desc=\"${label}\"" "${hierarchy}"; then
            return 0
        fi
        sleep 1
    done
    return 1
}

# Prints "left top right bottom" of the node whose content-desc is the label, from a `uiautomator dump`.
bounds_of() {
    local hierarchy=$1 label=$2 bounds
    bounds="$(sed -nE "s/.*content-desc=\"${label}\"[^>]*bounds=\"\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]\".*/\1 \2 \3 \4/p" \
        "${hierarchy}")"
    [[ -n "${bounds}" ]] || return 1
    echo "${bounds}"
}

screenshot() {
    adb exec-out screencap -p > "$1" 2> /dev/null && [[ -s "$1" ]]
}

switch_radii() {
    local hierarchy=$1 from_label=$2 to_label=$3 button left top right bottom x y
    button="$(bounds_of "${hierarchy}" "${from_label}")" || fail_step "no button labelled \"${from_label}\""
    read -r left top right bottom <<< "${button}"
    x=$(((left + right) / 2))
    y=$(((top + bottom) / 2))
    adb shell input tap "${x}" "${y}" || fail_step "tapping \"${from_label}\" at (${x}, ${y})"
    wait_for_label "${hierarchy}" "${to_label}" || fail_step "the button never read \"${to_label}\" after the tap"
    sleep 1
}

main() {
    local here app shots
    here="$(cd "$(dirname "$0")" && pwd)"
    app="${here}/ReproducerApp"
    shots="${here}/screenshots"
    work="$(mktemp -d)"
    trap 'rm -rf "${work}"' EXIT
    mkdir -p "${shots}"

    local system node_version java_version
    system="$(uname -sm)"
    node_version="$(node --version 2>&1)" || fail_step "node --version: ${node_version}"
    java_version="$(java -version 2>&1)" || fail_step "java -version: ${java_version}"
    echo "${system}, node ${node_version}, ${java_version%%$'\n'*}"

    local device_state
    device_state="$(adb get-state 2>&1)"
    [[ "${device_state}" == "device" ]] || fail_step "adb get-state: ${device_state}"
    local model release sdk abi sizes densities screen density
    read_device_property model ro.product.model
    read_device_property release ro.build.version.release
    read_device_property sdk ro.build.version.sdk
    read_device_property abi ro.product.cpu.abi
    sizes="$(adb shell wm size)" || fail_step "adb shell wm size: ${sizes}"
    sizes="${sizes//$'\r'/}"
    screen="$(sed -nE 's/^Override size: ([0-9]+x[0-9]+)$/\1/p' <<< "${sizes}")"
    [[ -n "${screen}" ]] || screen="$(sed -nE 's/^Physical size: ([0-9]+x[0-9]+)$/\1/p' <<< "${sizes}")"
    densities="$(adb shell wm density)" || fail_step "adb shell wm density: ${densities}"
    densities="${densities//$'\r'/}"
    density="$(sed -nE 's/^Override density: ([0-9]+)$/\1/p' <<< "${densities}")"
    [[ -n "${density}" ]] || density="$(sed -nE 's/^Physical density: ([0-9]+)$/\1/p' <<< "${densities}")"
    [[ -n "${screen}" && -n "${density}" ]] || fail_step "wm size and wm density: ${sizes} ${densities}"
    echo "device: ${model}, Android ${release} (API ${sdk}), ${abi}, ${screen} at ${density} dpi"
    [[ "${sdk}" -ge 30 ]] || fail_step "Outline.setPath casts a shadow from Android 11 (API 30); this device runs API ${sdk}"

    local install_output react_native_version
    install_output="$(cd "${app}" && yarn install --frozen-lockfile --non-interactive 2>&1)" ||
        { printf '%s\n' "${install_output}" | tail -n 20; fail_step "yarn install"; }
    react_native_version="$(cd "${app}" && node -p 'require("react-native/package.json").version' 2>&1)" ||
        fail_step "reading react-native's version: ${react_native_version}"
    echo "react-native ${react_native_version}"

    echo "== ./gradlew :app:assembleRelease -PreactNativeArchitectures=${abi}"
    local build_output
    build_output="$(cd "${app}/android" && ./gradlew --no-daemon --console=plain :app:assembleRelease \
        "-PreactNativeArchitectures=${abi}" 2>&1)" ||
        { printf '%s\n' "${build_output}" | tail -n 40; fail_step "the release build"; }

    local apk install_result
    apk="$(native_path "${app}/android/app/build/outputs/apk/release/app-release.apk")"
    install_result="$(adb install -r "${apk}" 2>&1)" || fail_step "adb install: ${install_result}"
    adb shell am force-stop "${package}"
    adb shell am start -W -n "${package}/.MainActivity" > /dev/null || fail_step "starting ${package}"

    local hierarchy="${work}/hierarchy.xml" equal_card uneven_card
    wait_for_label "${hierarchy}" "${dp_label}" || fail_step "the app showed no \"${dp_label}\" button"
    equal_card="$(bounds_of "${hierarchy}" "${equal_card_label}")" || fail_step "no bounds for \"${equal_card_label}\""
    uneven_card="$(bounds_of "${hierarchy}" "${uneven_card_label}")" || fail_step "no bounds for \"${uneven_card_label}\""
    sleep 2

    local dp_shot="${shots}/1-radii-in-dp.png" percentage_shot="${shots}/2-radii-as-percentages.png"
    local dp_again_shot="${shots}/3-radii-in-dp-again.png"
    screenshot "${dp_shot}" || fail_step "adb exec-out screencap -p"
    switch_radii "${hierarchy}" "${dp_label}" "${percentage_label}"
    screenshot "${percentage_shot}" || fail_step "adb exec-out screencap -p"
    switch_radii "${hierarchy}" "${percentage_label}" "${dp_label}"
    screenshot "${dp_again_shot}" || fail_step "adb exec-out screencap -p"
    echo "screenshots: screenshots/${dp_shot##*/}, screenshots/${percentage_shot##*/}, screenshots/${dp_again_shot##*/}"

    local compare_script dp_file percentage_file dp_again_file
    compare_script="$(native_path "${here}/compare-shadows.mjs")"
    dp_file="$(native_path "${dp_shot}")"
    percentage_file="$(native_path "${percentage_shot}")"
    dp_again_file="$(native_path "${dp_again_shot}")"
    node "${compare_script}" "${dp_file}" "${percentage_file}" "${dp_again_file}" "${screen}" \
        "$((shadow_margin_dp * density / 160))" \
        "${equal_card_label}=${equal_card// /,}" "${uneven_card_label}=${uneven_card// /,}"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
