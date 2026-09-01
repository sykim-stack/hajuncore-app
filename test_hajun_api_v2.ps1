# ============================================================
# 하준아이 /api/hajun 검증 스크립트 (v2)
# - Windows PowerShell 5.1의 Invoke-RestMethod 한글(UTF-8) 깨짐 버그를
#   HttpClient로 우회
# - $Api 값이 비어있는지 실행 즉시 확인 가능하도록 진단 출력 추가
# ============================================================

$Api = "https://hajuncore-app.vercel.app/api/hajun"

Write-Host "[진단] API 엔드포인트: '$Api'"
if ([string]::IsNullOrWhiteSpace($Api)) {
    Write-Host "[오류] Api 변수가 비어있습니다. 이 줄 위에서 실행이 잘못됐습니다." -ForegroundColor Red
    exit 1
}
Write-Host ""

Add-Type -AssemblyName System.Net.Http
$Client = New-Object System.Net.Http.HttpClient

function Get-JsonUtf8($Url) {
    $respStr = $Client.GetStringAsync($Url).Result
    return $respStr | ConvertFrom-Json
}

function Post-JsonUtf8($Url, $BodyObj) {
    $json = $BodyObj | ConvertTo-Json -Depth 10
    $content = New-Object System.Net.Http.StringContent($json, [System.Text.Encoding]::UTF8, "application/json")
    $resp = $Client.PostAsync($Url, $content).Result
    $respStr = $resp.Content.ReadAsStringAsync().Result
    return $respStr | ConvertFrom-Json
}

Write-Host "========================================"
Write-Host "1. 마당 목록 (yard_list)"
Write-Host "========================================"
$yards = Get-JsonUtf8 "$Api?action=yard_list"
$yards | ConvertTo-Json -Depth 10
Write-Host ""

Write-Host "========================================"
Write-Host "2. 개발마당 방 목록 (room_list)"
Write-Host "========================================"
$roomList = Get-JsonUtf8 "$Api?action=room_list&yard=gaebal"
$roomList | ConvertTo-Json -Depth 10
$coreringRoomId = ($roomList.payload.rooms | Where-Object { $_.key -eq "corering" }).id
Write-Host "-> corering 방 id: $coreringRoomId"
Write-Host ""

if ([string]::IsNullOrWhiteSpace($coreringRoomId)) {
    Write-Host "[오류] corering 방 id를 못 찾았습니다. 1,2번 응답을 확인하세요." -ForegroundColor Red
    exit 1
}

Write-Host "========================================"
Write-Host "3. 원본 질문 포스팅 (post_message, ref_ids 없음)"
Write-Host "========================================"
$q1 = Post-JsonUtf8 "$Api?action=post_message" @{
    room_id     = $coreringRoomId
    author_type = "human"
    author_name = "여리"
    msg_type    = "question"
    content     = "코어링에 번역된 내용을 단어별로 보는 기능을 만들고 싶다"
}
$q1 | ConvertTo-Json -Depth 10
$q1Id = $q1.payload.id
Write-Host "-> Q1 id: $q1Id"
Write-Host ""

Write-Host "========================================"
Write-Host "4. AI 답변 포스팅 (ref_ids = [Q1])"
Write-Host "========================================"
$a1 = Post-JsonUtf8 "$Api?action=post_message" @{
    room_id     = $coreringRoomId
    author_type = "ai"
    author_name = "claude-sonnet-5"
    msg_type    = "answer"
    content     = "번역 모달에 단어별 tooltip을 추가하면 됩니다"
    ref_ids     = @($q1Id)
}
$a1 | ConvertTo-Json -Depth 10
$a1Id = $a1.payload.id
Write-Host "-> A1 id: $a1Id"
Write-Host ""

Write-Host "========================================"
Write-Host "5. 사람 재구성 답변 (ref_ids = [Q1, A1])"
Write-Host "========================================"
$m1 = Post-JsonUtf8 "$Api?action=post_message" @{
    room_id     = $coreringRoomId
    author_type = "human"
    author_name = "여리"
    msg_type    = "decision"
    content     = "tooltip 말고 별도 모달로 가는 게 맞다. 코어챗/코어널 UI도 같이 봐야 함"
    ref_ids     = @($q1Id, $a1Id)
}
$m1 | ConvertTo-Json -Depth 10
Write-Host ""

Write-Host "========================================"
Write-Host "6. 방 뷰: corering 방 전체 이력 (Q1->A1->M1 순서 확인)"
Write-Host "========================================"
$roomView = Get-JsonUtf8 "$Api?action=view_room&room_id=$coreringRoomId"
$roomView.payload.messages | Select-Object msg_type, author_name, ref_ids, content | Format-List
Write-Host ""

Write-Host "========================================"
Write-Host "7. 거실 뷰: 개발마당 전체 방 최신 3개씩"
Write-Host "========================================"
$living = Get-JsonUtf8 "$Api?action=view_livingroom&yard=gaebal&limit=3"
$living.payload.rooms | ForEach-Object {
    Write-Host "$($_.name): $($_.messages.Count)건"
}
Write-Host ""

Write-Host "========================================"
Write-Host "8. 마당 뷰: 관제마당 방별 최신 1개씩"
Write-Host "========================================"
$yardView = Get-JsonUtf8 "$Api?action=view_yard&yard=gwanje"
$yardView.payload.rooms | ForEach-Object {
    Write-Host "$($_.name): $($_.latest.content)"
}
Write-Host ""

Write-Host "========================================"
Write-Host "9. 검증(실패 케이스): 잘못된 author_type -> _error 나와야 정상"
Write-Host "========================================"
$fail = Post-JsonUtf8 "$Api?action=post_message" @{
    room_id     = $coreringRoomId
    author_type = "system"
    author_name = "하준아이"
    msg_type    = "answer"
    content     = "test"
}
$fail | ConvertTo-Json -Depth 10
Write-Host ""

Write-Host "========================================"
Write-Host "검증 완료. traceId 존재 여부와 _error 없는지 확인하세요."
Write-Host "========================================"
