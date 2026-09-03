# ============================================================
# 하준아이 시드 스크립트 v8 - URL 하드코딩 (변수 제거)
# ============================================================

function Send-PostMessage($YardKey, $RoomKey, $Content, $RefIds) {
    # 🔥 여기에 URL을 직접 하드코딩했습니다. 변수를 쓰지 않습니다.
    $url = "https://hajuncore-app.vercel.app/api/hajun?action=post_message"
    
    $body = @{
        yard_key    = $YardKey
        room_key    = $RoomKey
        author_type = "human"
        author_name = "여리"
        msg_type    = "doc_injection"
        content     = $Content
    }
    if ($RefIds) {
        $body["ref_ids"] = $RefIds
    }
    
    $json = $body | ConvertTo-Json -Depth 10

    try {
        # -UseBasicParsing으로 IE 의존성 제거, 타임아웃 30초 설정
        $response = Invoke-WebRequest -Uri $url -Method Post -Body $json -ContentType "application/json; charset=utf-8" -UseBasicParsing -TimeoutSec 30
        $result = $response.Content | ConvertFrom-Json
        return $result
    } catch {
        $errorDetail = $_.Exception.Message
        # 네트워크 오류 시 상세 메시지를 위해
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $reader.BaseStream.Position = 0
            $reader.DiscardBufferedData()
            $responseBody = $reader.ReadToEnd()
            $errorDetail = "$errorDetail `n응답 본문: $responseBody"
        }
        return @{ _error = $errorDetail }
    }
}

# 디버깅: 현재 URL이 유효한지 테스트 (여기서는 무조건 성공해야 함)
Write-Host "[진단] 사용할 URL: https://hajuncore-app.vercel.app/api/hajun?action=post_message"
Write-Host ""

# ── 1. 브라이언풀 방 ──────────────────────────────────────────
Write-Host "1/11 포스팅 중: brainpool/brainpool"
$content1 = @'
[BRAINPOOL이란] 사람과 언어, 삶, 운영을 하나의 디지털 생태계로 연결하는 프로젝트. 완성된 제품을 향해 직선으로 가는 게 아니라, 사람과 AI가 공간 안에서 계속 경험하고 이해를 넓혀가는 프로젝트다.

[핵심 철학] Human First(최종 결정은 사람), Meaning First(데이터보다 의미와 맥락), Single Source of Truth(모든 데이터의 근간은 Message 하나), Core Independence(각 엔진은 독립적), Evolution over Expansion(무분별한 확장보다 철학에 기반한 진화), Documentation before Automation. 경험 중심 개발 원칙: 시도 -> 답변 -> 오류/혼선 -> 사람의 관찰과 보완 -> 원문 보존 -> 다음 맥락에서 재참조 -> 다시 시도. 에러를 없애는 게 아니라 사라지지 않도록 의미 있게 연결하는 것이 핵심이다. 원문은 삭제/덮어쓰지 않고, 사람의 교정과 AI의 답변은 구분하며, 개발과 관제는 공통 경험 맥락을 바라본다.

[핵심 파이프라인] Message -> Translation -> Analysis -> Knowledge -> Meaning -> CoreHub -> Decision Support -> Human Decision -> Experience. 모든 엔진은 ctx를 입력받아 처리된 ctx를 반환하며(throw 금지, _error만 사용), ctx의 소유권을 갖지 않고 불변성을 유지한다.

[프로젝트 경계] CoreNull=공간(View)·스위치(추천/판단/의미분석 안 함), CoreHub=판단(Decision)·연결(공간 안 만듦, 현재 pause), HajunAI=사고(Mind)·AI판 CoreNull 공간(CoreNull UI 대체 안 함), CoreRing=언어(Language, Identity 발급 안 함), CoreChat=흐름(Flow, 공간 안 만듦). 하나의 데이터는 반드시 하나의 Owner만 가진다.

[개발 원칙] 새 모듈은 (ctx)=>ctx 형태. Vercel Hobby 12-route 한도 - 새 기능은 action 파라미터로. 풀소스 교체 선호. Preemptive 테이블/문서 생성 금지 - 확인된 것만 만든다.

[최종 목표] 사람의 언어.삶.운영을 이해하는 OS. 각 Core는 독립 엔진이지만 Message라는 공통 원본으로 연결되고, HajunAI가 그 전체를 읽고 이해하며 판단을 돕는다. 이 방이 그 공통 세계관의 뿌리이며, 각 프로젝트 방은 이 방을 참조(ref_ids)하며 자신의 전문 영역을 쌓아간다.
'@

$result1 = Send-PostMessage "brainpool" "brainpool" $content1 $null
if ($result1._error) {
    Write-Host "  [실패] $($result1._error)" -ForegroundColor Red
    Write-Host "스크립트를 중단합니다." -ForegroundColor Red
    exit 1
}
$bpId = $result1.payload.id
Write-Host "  [✅ 완료] id: $bpId" -ForegroundColor Green
Write-Host ""

# ── 2. 개발마당 5개 방 ──────────────────────────────────────
$rooms_gaebal = @(
    @{ key = "corenull"; content = @'
[역할] 공간(View)·스위치. 추천/판단/우선순위/의미분석은 하지 않는다(BRAINPOOL 경계).
[핵심기능] House->Room->Post 구조, 마당·거실·서재 View, seed/fruit 스위치, 참여자, 생활 기록, Neighbor(House<->House 관계). 원본은 Message이고 나머지는 그것을 해석한 View다.
[현재상태] 하준아이가 이 공간 원리(House-Room-Message, 마당·거실·방)만 이식받아 자기 집을 지음 - CoreNull 자체를 원본으로 직접 연결하는 것은 중단됨.
'@ }
    @{ key = "corechat"; content = @'
[역할] 흐름(Flow)과 상호작용. 공간은 만들지 않는다(BRAINPOOL 경계, CoreNull의 역할).
[핵심기능] 대화 흐름, 세션, 상호작용, 오류 처리.
[현재상태] 구체적 구현/엔진 세부사항은 아직 확인된 문서가 부족함 - 지어내지 않고 정직하게 비워둠. 담당자 확인 후 갱신 필요.
'@ }
    @{ key = "corering"; content = @'
[역할] 언어(Language). Identity 자체 발급은 하지 않는다(BRAINPOOL 경계).
[핵심기능] Language Knowledge Engine - 번역, 언어 지식, 의미 분석, 패턴. CoreRingEngine -> Translation Module -> DeepL Connector 파이프라인 확인됨(DeepL + Mock Fallback).
[담당] 클로5.
'@ }
    @{ key = "corehub"; content = @'
[역할] 판단(Decision)·연결. 공간은 만들지 않는다(BRAINPOOL 경계, 현재 pause).
[핵심기능] Core 간 연결·전달·취합·통합. 운영 관리(키워드/볼트/점수 엔진).
[담당] 클로4.
[현재상태] pause 이후 재개 단계로 추정 - 현재 개발 우선순위에 'CoreHub 구현' 표시됨.
'@ }
    @{ key = "hajun"; content = @'
[역할] 사고(Mind)·AI판 CoreNull 공간. CoreNull UI를 대체하지 않는다(BRAINPOOL 경계).
[핵심기능] 하준아이 자체가 하나의 집 - 관제마당·개발마당을 담은 맥락·공간·이해 시스템. 두뇌 AI(Claude/GPT/Gemini 등)는 교체 가능한 실행 주체일 뿐.
[현재상태] 메시지 원본은 오직 방에만 존재, append-only, ref_ids로 성장의 계보를 남긴다. 새 두뇌 AI는 context_package 주입이 아니라 방을 스스로 읽어 맥락을 복구한다.
'@ }
)

$i = 2
foreach ($room in $rooms_gaebal) {
    Write-Host "$i/11 포스팅 중: gaebal/$($room.key)"
    $r = Send-PostMessage "gaebal" $room.key $room.content @($bpId)
    if ($r._error) { Write-Host "  [실패] $($r._error)" -ForegroundColor Red } else { Write-Host "  [✅ 완료] id: $($r.payload.id)" -ForegroundColor Green }
    $i++
    Write-Host ""
}

# ── 3. 관제마당 5개 방 ──────────────────────────────────────
$rooms_gwanje = @(
    @{ key = "lang_meaning"; content = "관제마당 '언어.의미' 방 - 관련 엔진: CoreRing, CoreChat, Hajun, CoreHub. 이 방은 개발마당의 여러 방(코어링/코어챗/하준/코어헙)에 걸친 내용을 '언어와 의미를 어떻게 이해하고 있는가'라는 목적으로 다시 바라보는 자리다. 개발 쪽 메시지를 참조(ref_ids)해서 이어가는 것을 권장." }
    @{ key = "dialogue_context"; content = "관제마당 '대화.맥락' 방 - 관련 엔진: CoreChat, Hajun, CoreRing. 대화 흐름과 맥락 이해에 관한 관찰을 남기는 자리. 개발마당 코어챗/하준/코어링 방의 메시지를 참조해서 이어갈 수 있다." }
    @{ key = "neighbor_link"; content = "관제마당 '이웃.연결' 방 - 관련 엔진: CoreNull, CoreHub, Hajun. CoreNull에서 이웃은 House<->House 관계이며 단순 접근권한이 아니다. 하준아이의 관제마당<->개발마당도 이웃 관계로 서로의 방 메시지를 공유한다." }
    @{ key = "life_space"; content = "관제마당 '생활.공간' 방 - 관련 엔진: CoreNull(주), Hajun, CoreHub. CoreNull의 본질이 '생활 공간(Space/Life)'이므로 이 방이 CoreNull과 가장 직접적으로 맞닿아 있다. House.Room.Post, 마당.거실 View, seed/fruit 스위치, 참여자, Neighbor 등 CoreNull의 생활 기록 관련 논의를 남기는 자리." }
    @{ key = "state_memory"; content = "관제마당 '상태.기억' 방 - 관련 엔진: Hajun, CoreHub, CoreNull. 하준아이의 이해.판단.맥락.기억이 어떻게 쌓이고 있는지를 다루는 자리. 확정 원칙: 메시지 원본은 오직 방에만 존재하고 append-only이며, ref_ids로 성장의 계보(딛고 선 이전 메시지)를 남긴다. 틀린 이해는 지우지 않고 새 메시지로 옆에 쌓아 넘어선다." }
)

foreach ($room in $rooms_gwanje) {
    Write-Host "$i/11 포스팅 중: gwanje/$($room.key)"
    $r = Send-PostMessage "gwanje" $room.key $room.content $null
    if ($r._error) { Write-Host "  [실패] $($r._error)" -ForegroundColor Red } else { Write-Host "  [✅ 완료] id: $($r.payload.id)" -ForegroundColor Green }
    $i++
    Write-Host ""
}

Write-Host "========================================"
Write-Host "🎉 완료. 브라이언풀 방 id: $bpId"
Write-Host "총 11개 방 시드 완료."
Write-Host "========================================"