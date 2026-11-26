#!/usr/bin/env bash
# Re-shoots every characters screenshot in shots/characters (+ the JSON reports) from fixed URLs.
#   npx vite --port 5701 &   then   bash tools/characters/shots.sh [filter]
# Headless Chromium uses SwiftShader: CPU timings in the JSON are meaningful, frame times are not.
set -u
cd "$(dirname "$0")/../.."
B=http://localhost:5701
C="/?characters=1"
declare -a SHOTS=(
  "01_lineup_a|$C&scene=lineup&page=0&t=0.6|1600|900"
  "02_lineup_b|$C&scene=lineup&page=1&t=0.6|1600|900"
  "03_lineup_a_side|$C&scene=lineup&page=0&t=0.6&yaw=-60|1600|900"
  "04_leads_act1|$C&scene=leads&act=1&t=0.6|1600|900"
  "05_leads_act2|$C&scene=leads&act=2&t=0.6|1600|900"
  "06_leads_act3|$C&scene=leads&act=3&t=0.6|1600|900"
  "07_teddy_face|$C&scene=leads&t=0.6&zoom=1&focus=0|900|900"
  "08_delphine_face|$C&scene=leads&t=0.6&zoom=1&focus=1|900|900"
  "09_nick_face|$C&scene=leads&t=0.6&zoom=1&focus=2|900|900"
  "10_walk|$C&scene=course&shot=walk&t=2|1600|900"
  "11_run|$C&scene=course&shot=walkrun&t=3.2|1600|900"
  "12_curb_ik|$C&scene=course&shot=curb&t=2.4|1600|900"
  "13_stairs_ik|$C&scene=course&shot=stairs&t=2.6|1600|900"
  "14_slope|$C&scene=course&shot=slope&t=2|1600|900"
  "15_turn_in_place|$C&scene=course&shot=turn&t=1.2|1600|900"
  "16_hail_cab|$C&scene=course&shot=hail&t=1.1|1600|900"
  "17_ledge|$C&scene=course&shot=ledge&t=1.4|1600|900"
  "19_crowd_400_high|$C&scene=crowd&n=400&quality=high&t=1|1600|900"
  "20_crowd_120_low|$C&scene=crowd&n=120&quality=low&t=1|1600|900"
  "21_shoes|$C&scene=shoes&t=0.4&yaw=-60|2000|700"
  "22_hair_men|$C&scene=hair&t=0.4&styles=short,sidePart,slick,combOver,pompadour,earLength,afroShort,cornrows,buzz|2000|700"
  "23_hair_women|$C&scene=hair&t=0.4&styles=feathered,shag,bob,flip,longStraight,ponytail,updo,setCurls,afro|2000|700"
  "24_street_eye|$C&scene=street&n=140&t=1|1600|900"
  "25_street_400|$C&scene=street&n=400&cs=0&cy=6&fov=55&t=1|1600|900"
  "26_street_120_low|$C&scene=street&n=120&quality=low&t=1|1280|720"
  "27_rocketbox_ab|$C&scene=rocketbox&t=0.6|1600|900"
  "28a_teddy_rb|$C&scene=rocketbox&t=0.6&zoom=head&focus=0&yaw=-25|900|900"
  "28b_teddy_ours|$C&scene=rocketbox&t=0.6&zoom=head&focus=1&yaw=-25|900|900"
  "28c_delphine_rb|$C&scene=rocketbox&t=0.6&zoom=head&focus=2&yaw=-25|900|900"
  "28d_delphine_ours|$C&scene=rocketbox&t=0.6&zoom=head&focus=3&yaw=-25|900|900"
  "28e_nick_rb|$C&scene=rocketbox&t=0.6&zoom=head&focus=4&yaw=-25|900|900"
  "28f_nick_ours|$C&scene=rocketbox&t=0.6&zoom=head&focus=5&yaw=-25|900|900"
  "29_pool_heads|$C&scene=rocketbox&pool=1&n=8&t=0.6|1600|900"
  "30_neck_seam|$C&scene=rocketbox&t=0.6&zoom=head&focus=2&yaw=150|900|900"
)
for s in "${SHOTS[@]}"; do
  IFS='|' read -r name url w h <<< "$s"
  [[ -n "${1:-}" && "$name" != *"$1"* ]] && continue
  npx tsx tools/characters/shot.ts --base "$B" --url "$url" --out "shots/characters/$name.png" --w "$w" --h "$h" --timeout 560000 2>&1 | grep -q '^shot' && echo "ok $name" || echo "FAILED $name"
done
