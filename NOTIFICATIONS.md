# 팀별 자동 알림 연결

담당자 표는 관리자 모드의 ‘출입신청 담당자 보기 → 담당자 정보 수정’에서 관리합니다. 요청팀 목록은 ‘팀명 이름, 이름’으로 표시되며 전화번호·이메일은 표에서만 표시합니다. 기존 신청의 요청팀 문자열은 유지됩니다.

신규 신청 저장 후 서버가 신청 원본과 브라우저 소유 키를 검증하고 선택한 팀의 담당자 두 명에게 솔라피 문자(LMS)와 Microsoft 365 HTML 표 이메일을 전송합니다. 수신 주소·본문은 서버가 저장된 자료로 구성하며 클라이언트가 수신자를 임의로 지정하지 못합니다. 수정 저장·과거 신청·담당자 수정만으로는 알림을 보내지 않습니다.

## 운영 연결에 필요한 설정

현재 Hosting·Firestore 배포 계정 외에 다음 설정이 필요합니다. 비밀값을 채팅, 소스코드, 일반 설정 화면에 넣지 마세요.

1. Firebase 프로젝트 `permit-daesan-461e8`에서 Cloud Functions 사용이 가능한 Blaze 요금제 및 결제 연결을 확인합니다. 2세대 Functions, Cloud Build, Artifact Registry, Cloud Run, Secret Manager API가 필요합니다. 기존 CI 서비스 계정에 Functions 배포·Secret Manager 비밀 관리 및 실행 계정 사용 권한이 필요할 수 있습니다. 프로젝트 관리자가 기존 배포 계정의 권한을 확인합니다.
2. 솔라피에서 API 키·시크릿과 승인된 문자 발신번호를 준비합니다. LMS 발송 잔액도 필요합니다.
3. 회사 Microsoft Entra ID에 조직 전용 앱을 등록합니다. **Microsoft Graph → Application permissions → Mail.Send** 권한에 회사 관리자 동의가 필요합니다. 발신 사서함은 Exchange Online 메일박스여야 합니다. 회사 관리자는 Exchange Online Application RBAC 또는 Application Access Policy로 앱의 발송 범위를 지정 발신 사서함으로 제한하는 것이 좋습니다.
4. 조직(tenant) ID, 앱(client) ID, 앱 client secret, 발신 사서함 주소를 준비합니다. 개인 사용자의 Outlook 로그인 비밀번호는 사용하지 않습니다.
5. GitHub 저장소 `sskim4912/permit` → Settings → Secrets and variables → Actions → Repository secrets에 **PERMIT_NOTIFICATION_CONFIG**를 아래 형식의 JSON으로 저장합니다. 기존 FIREBASE_SERVICE_ACCOUNT는 유지합니다.

```json
{
  "solapi": {
    "apiKey": "SOLAPI_API_KEY",
    "apiSecret": "SOLAPI_API_SECRET",
    "from": "등록된 발신번호"
  },
  "microsoft365": {
    "tenantId": "조직 ID",
    "clientId": "앱 ID",
    "clientSecret": "앱 비밀값",
    "sender": "자동메일 발신 사서함 주소"
  }
}
```

6. GitHub Actions의 **Test and deploy Firebase → Run workflow**에서 `permit-firebase-setup` 브랜치를 실행합니다. 설정이 있으면 CI가 Firebase Secret Manager에 저장하고 알림 함수를 배포한 뒤 사이트를 배포합니다. 설정이 없으면 담당자/팀 선택 화면만 배포하며 자동 발송은 오류 메시지로 안내합니다. 관리자 수정 화면은 API 키 저장 장소가 아닙니다.

## 결과와 재시도

- ‘발송 요청 접수’는 솔라피 또는 Microsoft 365가 요청을 수락했다는 뜻입니다. 수신 단말·받은편지함 도착을 보장하지 않으며 최종 배달 결과는 각 서비스에서 확인합니다. Microsoft 365 메일은 발신 사서함의 보낸편지함에도 저장합니다.
- 수신자·채널별 완료 내역을 서버에 저장합니다. 다시 확인·전송하면 이미 접수된 건은 재발송하지 않습니다. 한 팀에서 연락처가 동일한 담당자는 채널별로 중복 제거합니다.
- 설정 누락·서비스 거절 등 확실한 실패만 재시도합니다. 전송 중 연결 단절·서버 중단으로 접수 여부가 불확실하면 자동 재전송하지 않고 발송 내역 확인 메시지를 표시합니다. 관리자에게 접수번호/서비스 내역을 확인하도록 요청합니다.
- 새 알림 요청은 신청 후 10분 이내, 기존 알림 결과 확인·재시도는 같은 브라우저에서 가능합니다. 결과는 신청 원본을 읽고 검증한 뒤 반환하며 서버 기록은 공개하지 않습니다. 브라우저 탭에는 마지막 미확인 신청의 ID만 임시 저장합니다.
- 같은 신청 ID를 다른 묶음으로 다시 제출해도 기존 발송 예약과 충돌하면 거절합니다. 소유 키 및 IP별 시간당 30개 묶음 한도를 적용하고, 알림 함수 인스턴스는 최대 3개로 제한합니다. 서버 발송 비용은 연결한 서비스의 요금에 따릅니다.

## 검증

`npm test --prefix functions`는 외부 발송 없이 모의 응답으로 라우팅, 본문 이스케이프, HMAC, Graph 인증/접수, 중복 방지, 부분 실패와 재시도를 검사합니다. Firestore 에뮬레이터 테스트는 공개 조회·관리자 전용 저장·유효성·버전 충돌·서버 전용 발송 기록 접근 차단을 검사합니다. 운영 수신자에게 시험 문자를 자동 전송하지 않습니다. 서비스 연결 뒤 회사 관리자가 정한 시험 팀/수신자로 실제 배달을 확인하세요.
