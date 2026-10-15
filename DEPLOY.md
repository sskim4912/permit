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

## GitHub 자동 배포 (PC 설치 불필요)

`.github/workflows/firebase-deploy.yml`이 `main` 또는 `permit-firebase-setup`의 push마다 실행됩니다. PC에 Node.js, Java 또는 Firebase CLI를 설치할 필요가 없습니다. GitHub가 도구를 설치하고 빌드·UI 테스트·Firebase 에뮬레이터 테스트를 수행합니다. 테스트가 실패하면 배포하지 않습니다. 테스트 job에는 배포 자격증명을 제공하지 않습니다.

### 브라우저에서 최초 한 번 권한 연결

1. [Google Cloud 서비스 계정](https://console.cloud.google.com/iam-admin/serviceaccounts?project=permit-daesan-461e8)에서 프로젝트 ID가 `permit-daesan-461e8`인지 확인합니다.
2. **서비스 계정 만들기**를 누르고 이름을 `github-permit-deploy`로 입력합니다.
3. 프로젝트 역할로 다음 네 가지를 부여합니다. Owner/Editor 권한은 필요하지 않습니다.
   - Firebase Hosting Admin (`roles/firebasehosting.admin`)
   - Firebase Rules Admin (`roles/firebaserules.admin`)
   - Firebase Viewer (`roles/firebase.viewer`)
   - Service Usage Consumer (`roles/serviceusage.serviceUsageConsumer`)
4. 사용자에게 서비스 계정 접근 권한을 부여하는 마지막 단계는 생략하고 완료합니다.
5. 만든 서비스 계정 → **키 → 키 추가 → 새 키 만들기 → JSON**으로 키 파일을 받습니다.
6. GitHub 저장소 → **Settings → Secrets and variables → Actions → New repository secret**을 엽니다.
7. 이름은 **FIREBASE_SERVICE_ACCOUNT**, 값은 받은 JSON 파일의 전체 내용으로 입력해 저장합니다. **키를 채팅에 보내거나 저장소 파일로 올리지 마세요.**
8. GitHub **Actions → Test and deploy Firebase**의 최근 실행을 열고 **Re-run all jobs**를 누릅니다. Actions 사용이 비활성화돼 있다면 먼저 저장소에서 활성화합니다. workflow가 기본 브랜치에 있으면 Run workflow로도 실행할 수 있습니다.
9. Build and test와 Publish website and Firestore rules가 모두 초록색이면 배포 결과 URL을 확인합니다. 브랜치가 `permit-firebase-setup`인지 확인하세요.

첫 실행은 배포 secret이 없어 배포 단계에서 실패할 수 있습니다. secret 저장 후 전체 작업을 재실행하세요. 테스트 실패라면 오류 원인을 해결해야 합니다. 키 생성이 조직 정책으로 차단된 경우 정책을 우회하지 말고 관리자에게 Workload Identity Federation 연결을 요청하세요.

이 workflow는 웹사이트와 Firestore 규칙을 모두 운영 프로젝트에 게시합니다. 현재 사이트를 교체합니다. 자동화 결과가 초록색이어도 실제 신청·로그인·수정·다운로드·메일 기능은 위의 실제 동작 확인 절차로 추가 확인하세요. 배포용 키는 폐기/교체할 수 있으며 폐기 시 자동 배포가 중단됩니다.
