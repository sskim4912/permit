# 무료 빠른 문자 실행 연결

기존 GitHub 작업을 신청 직후 호출합니다. GitHub 실행 대기 시간은 남으며 즉시 수신을 보장하지 않습니다. 기존 예약 발송은 유지합니다. URL을 사이트에 연결하기 전에는 동작하지 않습니다.

1. Apps Script 프로젝트 이름을 `출입신청 문자 빠른실행`으로 변경합니다.
2. `Code.gs` 전체를 이 폴더의 `Code.gs`로 교체하고 저장합니다.
3. GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens에서 `sskim4912/permit` 저장소만 선택하고 Repository permissions의 **Actions: Read and write**를 부여합니다. 만료일을 설정합니다. 토큰은 채팅이나 소스 코드에 붙이지 않습니다.
4. Apps Script 왼쪽 프로젝트 설정(톱니바퀴) → 스크립트 속성에 이름 `GITHUB_TOKEN`, 값은 생성한 토큰을 저장합니다.
5. 함수 선택에서 `checkSetup`을 선택하여 실행하고 Google 계정의 외부 요청 권한을 승인합니다. 이 함수는 문자 발송 없이 GitHub 연결만 확인합니다.
6. 배포 → 새 배포 → 웹 앱. 실행 사용자는 **나**, 액세스 권한은 **모든 사용자**로 선택합니다. 조직 정책으로 이 옵션이 없으면 관리자에게 문의합니다.
7. 배포된 `/exec` URL만 사이트 연결 담당자에게 전달합니다. 토큰은 전달하지 않습니다. 사이트 연결은 별도 작업입니다.

공개 웹 앱은 신청 소유 키, 실제 신청/큐 일치, 신청 시각(15분 이내)을 확인한 뒤 고정된 작업만 호출합니다. 캐시 중복 제한과 GitHub 작업의 기존 중복 발송 방지 장치를 함께 사용합니다. Google Apps Script 실행 할당량과 GitHub Actions 무료 한도가 적용됩니다. 토큰이 만료되거나 실행 한도에 도달하면 기존 예약 작업이 처리합니다.
