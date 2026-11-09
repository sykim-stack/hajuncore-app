# Hermes Phase 1 — 연결 승인 면 적용
# 사용법 (G:\hajuncore-app 에서):
#   powershell -ExecutionPolicy Bypass -File .\apply_hermes_connect.ps1
# 또는:
#   Invoke-WebRequest -Uri "https://raw.githubusercontent.com/sykim-stack/hajuncore-app/main/patches/apply_hermes_connect.ps1" -OutFile .\apply_hermes_connect.ps1
#   powershell -ExecutionPolicy Bypass -File .\apply_hermes_connect.ps1

$ErrorActionPreference = "Stop"
$path = "app\chat\page.tsx"
if (-not (Test-Path $path)) { $path = "G:\hajuncore-app\app\chat\page.tsx" }
if (-not (Test-Path $path)) { Write-Error "app/chat/page.tsx 없음. 레포 루트에서 실행하세요." }

$t = [System.IO.File]::ReadAllText($path)
if ($t -match "acceptConnect") { Write-Host "이미 적용됨."; exit 0 }
if ($t -match "복구 중|EMERGENCY PARTIAL") { Write-Error "복구 중 파일입니다. 219b8cd 정상본으로 먼저 복원하세요." }

function Replace-Once([string]$src, [string]$old, [string]$new, [string]$label) {
  $i = $src.IndexOf($old)
  if ($i -lt 0) { throw "못 찾음: $label" }
  return $src.Remove($i, $old.Length).Insert($i, $new)
}

$old1 = @'
  const [showUnderstandingConfirm, setShowUnderstandingConfirm] = useState(false);
  const [currentUnderstanding, setCurrentUnderstanding] = useState<string | null>(null);
  const [understandingLoading, setUnderstandingLoading] = useState(false);
  const [resynthLoading, setResynthLoading] = useState(false);
'@

$new1 = @'
  const [showUnderstandingConfirm, setShowUnderstandingConfirm] = useState(false);
  const [currentUnderstanding, setCurrentUnderstanding] = useState<string | null>(null);
  const [understandingLoading, setUnderstandingLoading] = useState(false);
  const [resynthLoading, setResynthLoading] = useState(false);

  // Phase 1: 연결 제안 (ref/칩 제안만 · write 없음)
  const [showConnectHint, setShowConnectHint] = useState(false);
  const [connectUnderstanding, setConnectUnderstanding] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
'@

$old2 = @'
  /** Phase 1: 확인질문 제안 → 입력창 초안만. 전송은 사람. */
  const acceptConfirmQuestion = () => {
    const draftQ = '이 부분에서 확인하고 싶은 점이 있어요. 어떤 의미로 말씀하신 건가요?';
    setInput(draftQ);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px';
      textareaRef.current.focus();
    }
  };
'@

$new2 = @'
  /** Phase 1: 확인질문 제안 → 입력창 초안만. 전송은 사람. */
  const acceptConfirmQuestion = () => {
    const draftQ = '이 부분에서 확인하고 싶은 점이 있어요. 어떤 의미로 말씀하신 건가요?';
    setInput(draftQ);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px';
      textareaRef.current.focus();
    }
  };

  /** Phase 1: 연결 제안 — 현재 이해만 보여줌. 자동 링크/write 없음. */
  const acceptConnect = async () => {
    setConnectLoading(true);
    setConnectUnderstanding(null);
    setShowConnectHint(true);
    try {
      const res = await fetch('/api/hajun?action=contexts');
      const json = await res.json();
      const t =
        (json?.payload?.understanding && String(json.payload.understanding).trim()) ||
        '(아직 저장된 이해가 없습니다)';
      setConnectUnderstanding(t);
    } catch (e) {
      setConnectUnderstanding(
        `이해를 불러오지 못했습니다: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setConnectLoading(false);
    }
  };
'@

$old3 = @'
                        {(m.hermes.candidates || []).includes('이해갱신') && (
                          <button type="button" style={S.hermesBtn} onClick={acceptUnderstandingUpdate}>
                            이해갱신 제안 받기
                          </button>
                        )}
                      </div>
'@

$new3 = @'
                        {(m.hermes.candidates || []).includes('이해갱신') && (
                          <button type="button" style={S.hermesBtn} onClick={acceptUnderstandingUpdate}>
                            이해갱신 제안 받기
                          </button>
                        )}
                        {(m.hermes.candidates || []).includes('연결') && (
                          <button type="button" style={S.hermesBtn} onClick={acceptConnect}>
                            연결 제안 보기
                          </button>
                        )}
                      </div>
'@

$old4 = @'
                {resynthLoading ? '실행 중…' : '이 이해를 다시 만들기'}
              </button>
            </div>
          </div>
        </div>
      )}

            <div style={S.inputArea}>
'@

$new4 = @'
                {resynthLoading ? '실행 중…' : '이 이해를 다시 만들기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 1: 연결 제안 — 현재 이해 표시만. write/링크 없음 */}
      {showConnectHint && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              width: 'min(480px, 92vw)',
              maxHeight: '80vh',
              overflowY: 'auto',
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ ...S.hermesLabel, marginBottom: 0 }}>연결 제안 · 실행 아님</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
              현재 이해·원본과 연결할 수 있습니다. Hermes가 자동으로 링크하거나 저장하지 않습니다.
              마당에 남길 때 아래 내용을 참고하세요.
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text2)',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '10px 12px',
                minHeight: 80,
              }}
            >
              {connectLoading
                ? '불러오는 중…'
                : connectUnderstanding || '(없음)'}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                style={S.hermesBtn}
                onClick={() => {
                  setShowConnectHint(false);
                  setConnectUnderstanding(null);
                }}
              >
                닫기
              </button>
              <button
                type="button"
                style={S.hermesBtn}
                onClick={() => {
                  const seed = (connectUnderstanding || '').trim();
                  if (seed && seed !== '(아직 저장된 이해가 없습니다)') {
                    setYardContent((prev) =>
                      prev.trim()
                        ? prev
                        : `[연결 참고]\n${seed.slice(0, 800)}`
                    );
                    setPanelOpen(true);
                    setYardStatus('Hermes 제안: 연결 — 참고 내용을 마당 패널에 넣었습니다. 필요 시 수정 후 남기세요.');
                  }
                  setShowConnectHint(false);
                  setConnectUnderstanding(null);
                }}
              >
                참고로 마당 패널에 넣기
              </button>
            </div>
          </div>
        </div>
      )}

            <div style={S.inputArea}>
'@

$t = Replace-Once $t $old1 $new1 "state"
$t = Replace-Once $t $old2 $new2 "handler"
$t = Replace-Once $t $old3 $new3 "button"
$t = Replace-Once $t $old4 $new4 "modal"

[System.IO.File]::WriteAllText($path, $t)
Write-Host "OK: 연결 승인 면 적용 완료 → $path"
Write-Host "확인:"
Select-String -Path $path -Pattern "연결 제안 보기|acceptConnect|복구 중" | ForEach-Object { $_.Line.Trim() }
Write-Host ""
Write-Host "다음:"
Write-Host "  git add app/chat/page.tsx"
Write-Host '  git commit -m "feat(hermes): Phase 1 연결 승인 면 (ref 제안만 · write 없음)"'
Write-Host "  git push origin main"
