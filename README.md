# 3PICKS 홈페이지 (www.3picks.co.kr)

이 폴더 하나가 홈페이지 전체입니다. 서버·데이터베이스·빌드 도구가 필요 없는 정적 사이트라서, 그대로 열면 동작하고 그대로 GitHub Pages에 올리면 됩니다.

## 1. 내 컴퓨터에서 열어 보기

- 가장 간단한 방법: `index.html`을 더블클릭해 브라우저로 엽니다.
- 실제 서버와 같은 조건으로 보려면 이 폴더에서 아래 한 줄을 실행하고 `http://127.0.0.1:4173/`을 엽니다.

  ```bash
  python3 -m http.server 4173 --bind 127.0.0.1
  ```

  (Node를 쓰신다면 `npx serve .` 도 같습니다.)

## 2. GitHub에 올리기

```bash
git init
git add .
git commit -m "3PICKS 홈페이지 최초 등록"
git branch -M main
git remote add origin https://github.com/<계정>/<저장소>.git
git push -u origin main
```

- 저장소는 **Public**이어야 무료 GitHub Pages를 쓸 수 있습니다(Private은 유료 플랜 필요).
- 파일 이름은 모두 영문·숫자라 Windows·Mac·Linux 어디서든 같은 이름으로 다뤄집니다.

## 3. GitHub Pages 켜기

1. 저장소 → **Settings → Pages**
2. Source: **Deploy from a branch**, Branch: **main / (root)** → Save
3. 1~3분 뒤 `https://<계정>.github.io/<저장소>/` 에서 먼저 확인할 수 있습니다. 모든 경로가 상대 경로라 하위 주소에서도 그대로 동작합니다.

## 4. 도메인 연결 (www.3picks.co.kr)

- 이 폴더의 `CNAME` 파일에 `www.3picks.co.kr`이 이미 들어 있어, Pages가 켜지면 Settings → Pages의 Custom domain에 자동으로 잡힙니다(안 잡히면 직접 입력 후 Save).
- 도메인 관리 화면(DNS)에서 아래 레코드를 넣어야 실제로 연결됩니다.

  | 종류 | 호스트 | 값 |
  |---|---|---|
  | CNAME | `www` | `<계정>.github.io` |
  | A | `@` (루트) | `185.199.108.153` / `185.199.109.153` / `185.199.110.153` / `185.199.111.153` |

- DNS 반영 뒤 Settings → Pages에서 **Enforce HTTPS**를 켭니다(인증서 발급까지 최대 24시간).
- 다른 서비스가 같은 도메인을 이미 GitHub Pages에 등록해 둔 상태면 GitHub이 거부합니다. 그럴 땐 도메인 소유 확인(Settings → Pages → Verify)이나 기존 등록 해제가 필요합니다.

## 5. 이후 수정할 때

- 이 저장소는 작업 폴더(`3Picks website/3picks homepage/`)에서 만든 배포본입니다. 작업 폴더를 갖고 있다면 거기서 고치고 배포본을 다시 만들어 이 저장소를 덮어쓰는 것이 기준입니다 — 이 저장소의 클론 폴더를 인자로 주면(`bash ../도구/build-official-bundle.sh <클론 폴더>`) 바로 덮어써 줍니다. 운영 콘솔(admin)이 저장소에 직접 반영한 상품 변경은 배포본을 만들 때 작업 폴더로 자동 회수됩니다.
- 이 저장소에서 직접 고쳐도 됩니다 — `git add . && git commit -m "..." && git push` 하면 1~3분 뒤 자동 반영됩니다.
- 상품 데이터: `assets/products-data.js`(전체 목록), 운영 조정값: `site-overrides.js`. 화면 코드는 `index.html`·`app.js`, 연락처·카카오톡 주소는 `config.js`입니다.
- `sitemap.xml`·`robots.txt`는 검색 노출용입니다. 주소를 바꾸면 이 두 파일과 `index.html` 안의 절대 주소도 함께 바꿉니다.
- `.github/workflows/site-health.yml`은 30분마다 사이트가 살아 있는지 확인하는 GitHub Actions입니다. 도메인 연결 전에는 실패 알림이 올 수 있으니 필요 없으면 Actions 탭에서 끄거나 파일을 지워도 사이트 동작에는 영향이 없습니다.
- 푸터의 사업자등록번호·통신판매업 신고번호는 임시값(0)입니다. 실제 번호를 받으면 `index.html`에서 해당 두 줄만 바꿉니다.

## 폴더 구성

```text
index.html                 홈페이지 본문
app.js                     화면 동작·설문·견적
config.js                  연락처·카카오톡 오픈채팅 주소
recommendation-core.js     추천 로직
site-overrides.js          운영 조정값(상품 노출·순위 등)
assets/                    이미지·로고·상품 데이터(products-data.js)
assets/products/           상품 사진 (WebP)
sitemap.xml · robots.txt   검색엔진용
CNAME                      GitHub Pages 도메인 설정
.nojekyll                  GitHub Pages가 파일을 가공하지 않게 하는 표시
.github/workflows/         사이트 상태 확인 자동화(선택)
```
