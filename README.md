# dsh-locale-ko-extra

DSH 웹 UI용 한국어 언어팩입니다. **단독으로 쓸 수 있고**, `dsh-locale-ko`가 켜져 있으면 그 위에 덧대는 오버레이로도 동작합니다.

| 모드 | 조건 | 동작 |
| --- | --- | --- |
| 단독 | `dsh-locale-ko` 꺼짐 | `ko` 언어를 직접 등록하고 사전 전체(스냅샷 0.1.1 + 추가 번역)를 넣습니다 |
| 오버레이 | `dsh-locale-ko` 켜짐 | 언어팩이 등록한 사전에 추가·수정분만 병합합니다 (중복 등록 없음) |

두 경우 모두 언어 목록에는 `한국어`가 하나만 나옵니다.

## 왜 오버레이만으로는 안 되는가

DSH 로케일 런타임은 같은 네임스페이스에 같은 언어를 두 번 등록하면 예외를 던집니다. 그래서 언어팩이 켜져 있을 때는 등록 대신 **이미 등록된 사전 객체에 직접 병합**합니다(`locale.dicts`가 들고 있는 객체를 조회 때마다 읽음).

반대로 언어팩이 꺼져 있으면 병합할 사전이 없습니다. 그래서 이 플러그인은 `base/ko.json`에 언어팩 0.1.1의 사전 스냅샷(58개 코어 + 10개 서드파티, 7,252개 문구)을 직접 갖고 있고, 필요할 때 스스로 등록합니다. 언어팩을 꺼 두고 이것만 켜도 화면이 한국어로 나오는 이유입니다.

## 현재 담긴 내용

- 언어팩 0.1.1 스냅샷 7,252개 문구
- 추가 번역 308개 (앱 0.2.1-rc.3에만 있는 문구)
- 기존 번역 수정 3개 (치환자 누락·오타)

수정 3건은 화면에 그대로 드러나던 버그입니다.

- `pluginManager.restartNotice` — `{reason}` 누락 (재시작 사유가 안 보임)
- `pluginManager.installDoneRestart` — `{reason}` 누락
- `pluginManager.reasonIncompatibleVersion` — `{requirements}` 대신 `{peers}` (화면에 `{peers}` 노출)

## 설치

### 웹 UI (`dsh web`) · 새 PC · 다른 프로필

```sh
npx @deepseek-ai/dsh plugin --profile web add github:Petenka315/dsh-locale-ko-extra
npx @deepseek-ai/dsh web
```

`--profile` 값은 쓰는 프로필 이름입니다(`web`, `desktop`, `tui` …).
패키지를 고친 뒤 다시 받으려면 `add`를 다시 실행하거나 프로필에서 `pnpm update dsh-locale-ko-extra`를 돌립니다.

### 데스크톱 앱

플러그인 화면 → **플러그인 추가** → 주소 칸에 `github:Petenka315/dsh-locale-ko-extra` → 설치 → **지금 사용**.

또는 앱에 등록한 `dsh` 명령으로:

```sh
dsh plugin --profile desktop add github:Petenka315/dsh-locale-ko-extra
```

### 이 PC의 현재 상태

- 프로필 `~/.dsh/profiles/desktop`
- 의존성: `"dsh-locale-ko-extra": "link:<이 폴더>"` (개발용 링크 — GitHub 배포판으로 바꾸려면 위 `add` 명령 재실행)
- `dsh.profile.bundles`에 `dsh-locale-ko-extra` 포함
- `node_modules/dsh-locale-ko-extra` → 이 폴더 정션

이 폴더의 파일을 고치고 앱만 다시 시작하면 반영됩니다(재설치 불필요).

## 유지보수

번역은 `overrides/ko.overrides.json`만 고치면 됩니다. `네임스페이스 → 키 → 한국어` 구조이고, 기존 키를 적으면 덮어씁니다.

```powershell
cd dsh-locale-ko-extra

node tools/build-client.cjs    # base + overrides → client.js
node tools/test-client.cjs     # 단독/오버레이/해제 동작 검증 (가짜 런타임)
node tools/verify.cjs          # 커버리지·치환자·컴파일 검사
```

셋 다 통과하면 앱을 다시 시작하세요. `client.js`는 생성물이므로 직접 고치지 마세요.

### 언어팩이 업데이트됐을 때 (최신 번역 끌어오기)

```powershell
# 설치된 언어팩 사전을 base 스냅샷으로 다시 뜬다
node tools/sync-base.cjs

# base가 바뀌었으니 다시 빌드·검증
node tools/build-client.cjs
node tools/test-client.cjs
node tools/verify.cjs
```

`sync-base.cjs`는 언어팩의 `dictionaries` / `pluginDictionaries`를 그대로 읽어 `base/ko.json`을 갱신합니다. 언어팩이 새로 번역한 문구는 여기로 들어오고, `overrides`에 있는 311개는 계속 이깁니다(필요 없어진 항목은 지우세요).

### 앱이 업데이트됐을 때 (새 문구 찾기)

```powershell
node tools/dump-clients.cjs "C:\Users\<이름>\AppData\Local\Programs\DeepSeek Harness\resources\app.asar" .cache\cores
node tools/extract-en.cjs .cache\cores reference\en-dicts.json
node tools/verify.cjs    # "untranslated keys" 목록으로 새로 비는 키 확인
```

새 키가 나오면 `reference/ko.overrides.json`에 추가하고 다시 `build → test → verify`를 돌립니다.

### 프로필에서 떼어내기

```powershell
node tools/install-into-profile.cjs "$env:USERPROFILE\.dsh\profiles\desktop" --revert
# 프로필에서 pnpm install (또는 DSH 플러그인 관리에서 새로고침)
```

## 알아 둘 점

- **둘 다 켜도 됩니다.** 부팅 시 언어팩이 먼저 등록되고 이 플러그인이 병합합니다. 다만 앱이 실행 중일 때 언어팩을 새로 켜면 `ko` 언어가 이미 있어 언어팩 쪽이 오류를 낼 수 있으니, 그때는 앱을 다시 시작하세요.
- 언어팩을 끄고 이 플러그인만 쓰면, 언어팩의 이후 업데이트는 자동으로 반영되지 않습니다. `tools/sync-base.cjs`로 끌어와야 합니다.
- 내부 필드(`locale.dicts`)에 의존합니다. DSH가 크게 바뀌면 여기부터 확인해야 하며, 접근할 수 없으면 콘솔 경고만 남기고 아무 것도 하지 않습니다(화면은 영어).
- 다른 플러그인이 코드에 직접 박아 둔 영어 문자열은 이 방법으로도 번역할 수 없습니다.
- `package.json`에 UTF-8 BOM이 들어가면 DSH가 번들을 건너뜁니다. 편집 후에는 `node tools/strip-bom.cjs package.json`으로 확인하세요.

## 파일

```
package.json                    dsh.client / dsh.bundle 선언
index.js                        호스트 half (동작 없음)
client.js                       생성된 브라우저 half (base + overrides)
cordis.patch.yml                로더 엔트리 삽입
base/ko.json                    언어팩 0.1.1 사전 스냅샷 (sync-base로 갱신)
overrides/ko.overrides.json     추가·수정 번역 원본
reference/en-dicts.json         앱 영어 사전 스냅샷 (0.2.1-rc.3)
tools/client-template.js        런타임 코드 템플릿
tools/build-client.cjs          base + overrides → client.js
tools/sync-base.cjs             언어팩 사전 → base/ko.json
tools/test-client.cjs           로케일 런타임 모형으로 동작 검증
tools/verify.cjs                커버리지·치환자 검사
tools/dump-clients.cjs          asar에서 클라이언트 번들 추출
tools/extract-en.cjs            번들에서 영어 사전 추출
tools/diff.cjs                  언어팩/스냅샷 ↔ 영어 사전 비교
tools/install-into-profile.cjs  프로필 등록/해제
tools/asar-lib.cjs              asar 읽기 도우미
tools/strip-bom.cjs             UTF-8 BOM 제거
backups/                        프로필 package.json·lockfile 백업 (git 제외)
```
## 라이선스

MIT. `base/ko.json`의 사전은 [dsh-locale-ko](https://github.com/juliankang4/dsh-locale-ko)
(MIT, © 2026 juliankang4)에서 가져왔습니다 — 원문은 `LICENSE-dsh-locale-ko`를 참고하세요.
