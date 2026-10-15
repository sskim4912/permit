# Firebase 게시 절차

대상 프로젝트: `permit-daesan-461e8`
대상 Hosting 사이트: `permit-daesan-461e8`

이 파일은 배포 준비 안내이며 배포 완료를 의미하지 않습니다. 현재 작업 환경에는 Firebase 배포 인증이 없습니다. 공개 웹 앱 설정(apiKey 등)은 배포 권한이 아닙니다.

## 1. 콘솔 준비

- Authentication의 이메일/비밀번호 제공업체를 활성화합니다.
- 관리자 이메일 `sskim07@gsenc.com`과 UID `ICEik0y5U3aETq3mvW7sesAsNRB2`가 같은 사용자 계정인지 확인합니다.
- 관리자 비밀번호는 Firebase 콘솔에서 설정한 값을 사용합니다. 화면에서는 이메일 입력을 요구하지 않습니다.
- Firestore `(default)` 및 Hosting 사이트가 생성되어 있어야 합니다.

## 2. 배포할 컴퓨터 준비

Node.js 22 이상(권장 LTS), Java 21 이상을 설치합니다. 파일을 내려받아 압축을 풀고 package.json이 있는 폴더에서 터미널을 엽니다.

```sh
npm ci
npm run build
npm run test:ui
npm test
```

`npm test`는 로컬 Firebase 에뮬레이터를 내려받고 실행하므로 `storage.googleapis.com`에 접근할 수 있어야 합니다. 반드시 실제 실행된 테스트가 통과했는지 확인하고, 실패하면 배포하지 말고 원인을 해결하세요. 운영 프로젝트에는 테스트 데이터를 쓰지 않습니다.

## 3. 로그인 및 대상 확인

```sh
npx firebase login
npx firebase hosting:sites:list --project permit-daesan-461e8
```

브라우저에서 이 프로젝트를 소유한 Google 계정으로 로그인합니다. 비밀번호·인증 코드를 채팅에 보내지 마세요. 목록에 `permit-daesan-461e8`이 있는지 확인하세요. 다른 앱의 사이트를 선택하지 마세요. 이미 firebase.json과 .firebaserc가 있으므로 `firebase init`은 필요 없습니다.

## 4. 규칙과 웹사이트 함께 배포

```sh
npm run deploy
```

기존 Firestore 규칙을 저장소의 `firestore.rules`로 교체하고 public 폴더를 Hosting에 게시합니다. 다른 컬렉션의 기존 규칙이 있다면 먼저 보존·병합해야 합니다. 이 출입관리 전용 프로젝트를 대상으로 준비했습니다.

성공한 뒤 CLI가 표시하는 Hosting URL로 접속합니다. 예상 주소는 `https://permit-daesan-461e8.web.app`이며 배포 성공 전에는 서비스가 게시됐다고 판단하지 마세요.

## 5. 실제 동작 확인

가상 개인정보로 신청 → 제출 확인 → 관리자 비밀번호 로그인 → 방문일 선택 → CSV 다운로드 → 신청 수정·삭제 → 로그아웃 후 개인정보가 숨겨지는지 확인하세요. 메일 작성 시 기본 수신자 `sskim07@gsenc.com`을 확인하고 실제 전송은 메일 앱에서 수행하세요. 운영 전 관리자 화면에서 발주처 주소로 변경할 수 있습니다.

## GitHub 자동 배포

첫 수동 배포와 기능 검증 후 별도로 연결합니다. GitHub에 코드를 올리는 것만으로는 Firebase에 배포되지 않습니다. 지금은 인증되지 않은 자동 배포 workflow를 추가하지 않았습니다.
