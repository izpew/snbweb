# SNBWEB

실시간 채팅과 게임 웹사이트의 로컬 개발 기반입니다. `AGENTS.md`, `SYSTEM.csv`, `DESIGN.css`를 기준으로 구성했습니다.

## 로컬 실행

Node.js 24 이상이 필요합니다. 외부 패키지 설치나 별도 DB 서버 설정은 필요 없습니다.

```powershell
cd D:\snbweb
npm.cmd run dev
```

브라우저에서 http://127.0.0.1:3000 에 접속합니다. 개발 모드는 서버 파일 변경 시 재시작합니다. 화면 파일 변경은 브라우저를 새로 고칩니다. 종료는 Ctrl+C입니다. 일반 실행은 `npm.cmd start`입니다. PowerShell 실행 정책으로 npm.ps1이 차단될 수 있어 `npm.cmd`를 사용합니다.

첫 화면에서 회원가입하면 자동 로그인합니다. 아이디는 영문·숫자·밑줄 3~24자, 비밀번호는 10~128자입니다. 로비에서 캐릭터를 추가하거나 이름을 수정할 수 있습니다.

## 구조

- `public/`: 한국어 프런트엔드, 기본 JavaScript 모듈, 반응형 CSS. 루트 DESIGN.css를 그대로 불러옵니다.
- `server/index.js`: Node HTTP 서버, JSON API, 인증·권한 확인, 정적 파일 제공, DB 초기화.
- `data/snbweb.sqlite`: 첫 실행 시 생성되는 실제 SQLite 데이터베이스. WAL 보조 파일이 함께 생성될 수 있습니다. Git에는 포함하지 않습니다.
- `tests/app.test.js`: 실제 HTTP 요청과 임시 SQLite 파일을 사용하는 통합 테스트.

계정 members와 캐릭터 characters를 외래 키로 분리합니다. 세션은 토큰 해시와 24시간 만료 시각을 DB에 저장합니다. 비밀번호는 무작위 salt와 scrypt로 해시합니다. 캐릭터 목록은 본인 계정으로 제한하며 수정 시 소유권을 서버에서 확인합니다. SQL은 매개변수 바인딩을 사용합니다. 인증 요청에는 IP별 분당 20회 제한이 있습니다.

## 설정

기본값은 `HOST=127.0.0.1`, `PORT=3000`입니다. `DATABASE_PATH`로 DB 파일 경로를 지정할 수 있습니다. `.env` 자동 로딩은 사용하지 않습니다.

```powershell
$env:PORT = '3100'
npm.cmd start
```

이 기반은 로컬 HTTP 실행용입니다. 외부 서비스 운영 전 HTTPS, Secure 쿠키, 프록시 환경의 출처·IP 처리, 운영용 요청 제한과 백업 정책을 구성해야 합니다.

## API

| 메서드 | 경로 | 기능 |
| --- | --- | --- |
| GET | /api/health | 서버·DB 연결 확인 |
| POST | /api/register | 회원가입 `{username,password}` |
| POST | /api/login | 로그인 `{username,password}` |
| GET | /api/me | 현재 계정 |
| POST | /api/logout | 로그아웃 `{}` |
| GET | /api/characters | 내 캐릭터 목록 |
| POST | /api/characters | 캐릭터 생성 `{name}` |
| PATCH | /api/characters/:id | 소유 캐릭터 이름 수정 `{name}` |

POST/PATCH는 Content-Type: application/json이 필요합니다. 로그인 세션은 HttpOnly·SameSite=Strict 쿠키로 전달합니다.

## 검증

```powershell
npm.cmd run check
npm.cmd test
```

현재 JavaScript 기반이며 `check`는 문법 검사입니다. TypeScript 타입 검사는 구성하지 않았습니다. 테스트는 비인증 차단, 잘못된 입력, 계정별 목록 격리, 타 계정 수정 차단, 정상 수정, 로그인 실패, 로그아웃, DB 재연결 후 저장 유지를 검증합니다.

## 범위와 다음 작업

이번 작업은 프로젝트 기반이며 전체 P0 기능 구현은 아닙니다. 실제 공지 데이터, 계정 정보 수정, 환경 설정, 채팅, 에피소드 참여 권한, 게임 기능은 미구현입니다. 화면의 안내 문구는 고정된 개발 안내이며 운영 공지 데이터가 아닙니다. 캐릭터 이름 길이 등의 입력 제한은 기술적 초기값이며 게임 규칙이 아닙니다.

최초 DB 스키마 버전은 schema_migrations의 1입니다. 기존 업무 데이터는 없었습니다. 이후 스키마 변경은 버전별 마이그레이션과 데이터 백업을 추가해야 합니다. 백업 시 서버를 종료하고 data 폴더 전체를 보관하세요. 이 디렉터리를 삭제하면 계정과 캐릭터 데이터가 사라집니다.
