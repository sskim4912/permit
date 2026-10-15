# GitHub에서 Firebase에 자동 게시

사용자 PC에 프로그램을 설치하지 않습니다. 저장소의 `permit-firebase-setup` 또는 `main` 브랜치 변경을 GitHub Actions가 검사하고 Firebase에 배포합니다.

- 프로젝트/Hosting 사이트: `permit-daesan-461e8`
- 주소: https://permit-daesan-461e8.web.app
- Workflow: `.github/workflows/firebase-deploy.yml`
- Firebase 규칙: `firestore.rules`

## 최초 권한 연결

Google Cloud에 전용 서비스 계정 `github-permit-deploy`를 생성하고 다음 역할을 부여합니다.

- Firebase Hosting Admin (`roles/firebasehosting.admin`)
- Firebase Rules Admin (`roles/firebaserules.admin`)
- Firebase Viewer (`roles/firebase.viewer`)
- Service Usage Consumer (`roles/serviceusage.serviceUsageConsumer`)

계정에서 JSON 키를 만든 후 GitHub 저장소 → Settings → Secrets and variables → Actions → Repository secrets에 이름 `FIREBASE_SERVICE_ACCOUNT`, 값은 JSON 전체를 저장합니다. 비밀키는 채팅/저장소/화면 캡처로 공유하지 마세요. 키 생성이 조직 정책으로 금지돼 있으면 우회하지 말고 관리자에게 Workload Identity Federation 연결을 요청하세요.

## 배포와 결과 확인

코드를 push하면 자동 실행됩니다. 이미 실패한 실행을 다시 실행하려면 GitHub Actions에서 해당 실행 → Re-run all jobs를 선택합니다. 빌드와 모든 테스트가 통과해야 배포됩니다. 테스트 중에는 운영 데이터에 쓰지 않습니다. 배포 후 새 커밋의 홈페이지·버전 표식·스크립트가 실제로 서비스되는지 재확인합니다.

Firebase 콘솔에서 관리자 이메일 `sskim07@gsenc.com`의 UID가 `ICEik0y5U3aETq3mvW7sesAsNRB2`인지 확인하세요. 이메일/비밀번호 제공업체가 활성화돼 있어야 합니다. 관리자 비밀번호는 Authentication에서 관리하며 앱 소스에 저장하지 않습니다.

## 운영 확인

가상 정보로 작성 → 자동 임시저장 복원 → 신청 → 관리자 로그인 → 수정/취소 → 인원 선택 → 실제 발주처 승인 후 승인 완료 처리 → 삭제 확인 순서로 확인합니다. 테스트 신청을 실제 업무자료로 오인하지 않도록 정리하세요.

발주처 제출은 메일 앱에서 실제 전송해야 합니다. 전송 후 ‘전송 완료로 기록’을 눌러 전달시각을 남깁니다. 앱이 실제 이메일 발송을 자동 검증하지는 않습니다. 초기 수신자는 `sskim07@gsenc.com`이고 관리자 화면에서 변경할 수 있습니다.

기존 신청서 데이터는 삭제하지 않습니다. 기존 상태는 표시할 때 두 상태로 매핑하며 원래 값은 유지합니다. 공유 비밀번호를 아는 사용자는 동일한 관리자 권한을 갖습니다. CSV에는 개인정보가 포함되며, 엑셀에서 전화번호를 텍스트 형식으로 가져오면 앞자리 0을 유지할 수 있습니다.
