import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useAuthStore from '../stores/useAuthStore';
import { getPlans } from '../api/subscription';
import { preparePayment, confirmPayment, freeDowngrade, getPaymentHistory, startFreeTrial, getTrialStatus, requestRefund } from '../api/payments';

// 플랜별 기능 목록 (프론트 표시용)
const PLAN_FEATURES = {
  free: [
    { label: '지도 검색 · 기본 시세 조회', included: true },
    { label: '관심 아파트 5개', included: true },
    { label: '시세 알림 1개', included: true },
    { label: '거래 내역 10건', included: true },
    { label: '통계 차트 1년', included: true },
    { label: '학군 정보', included: false, highlight: true },
    { label: '단지 비교', included: false },
    { label: '정책 발표 열람', included: false },
    { label: '경매 정보', included: false },
    { label: '학군 · 교통 오버레이', included: false },
  ],
  basic: [
    { label: '지도 검색 · 기본 시세 조회', included: true },
    { label: '관심 아파트 30개', included: true },
    { label: '시세 알림 10개', included: true },
    { label: '거래 내역 50건', included: true },
    { label: '통계 차트 3년', included: true },
    { label: '학군 정보 · 학교 오버레이', included: true, highlight: true },
    { label: '단지 비교 (2개)', included: true },
    { label: '정책 발표 열람', included: true },
    { label: '경매 정보', included: false },
    { label: '교통 오버레이', included: false },
  ],
  pro: [
    { label: '지도 검색 · 기본 시세 조회', included: true },
    { label: '관심 아파트 무제한', included: true },
    { label: '시세 알림 무제한', included: true },
    { label: '거래 내역 전체', included: true },
    { label: '통계 차트 5년+', included: true },
    { label: '학군 정보 · 학교 오버레이', included: true, highlight: true },
    { label: '단지 비교 (3개)', included: true },
    { label: '정책 발표 열람', included: true },
    { label: '경매 정보 (서울)', included: true, highlight: true },
    { label: '교통 오버레이', included: true },
  ],
};

const PLAN_STYLES = {
  free: { accent: 'gray', gradient: 'from-gray-500 to-gray-600' },
  basic: { accent: 'blue', gradient: 'from-blue-500 to-indigo-600' },
  pro: { accent: 'violet', gradient: 'from-violet-500 to-purple-600' },
};

const PLAN_RANK = { free: 0, basic: 1, pro: 2 };

export default function SubscriptionPage() {
  const { user, isAuthenticated, updateSubscription } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);
  const [trialEligible, setTrialEligible] = useState(false);
  const [refundingId, setRefundingId] = useState(null);
  const tossPaymentRef = useRef(null);

  useEffect(() => {
    getPlans()
      .then((data) => setPlans(data.plans))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // 무료 체험 가능 여부
  useEffect(() => {
    if (isAuthenticated) {
      getTrialStatus()
        .then((data) => setTrialEligible(data.eligible))
        .catch(() => {});
    }
  }, [isAuthenticated]);

  // 토스페이먼츠 SDK 로드
  useEffect(() => {
    if (document.getElementById('toss-payments-sdk')) return;
    const script = document.createElement('script');
    script.id = 'toss-payments-sdk';
    script.src = 'https://js.tosspayments.com/v1/payment';
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // 결제 성공/실패 콜백 처리
  useEffect(() => {
    const paymentKey = searchParams.get('paymentKey');
    const orderId = searchParams.get('orderId');
    const amount = searchParams.get('amount');

    if (paymentKey && orderId && amount) {
      handlePaymentSuccess(paymentKey, orderId, amount);
    }

    const code = searchParams.get('code');
    if (code) {
      setPaymentResult({
        success: false,
        message: searchParams.get('message') || '결제가 취소되었습니다.',
      });
    }
  }, [searchParams]);

  const handlePaymentSuccess = async (paymentKey, orderId, amount) => {
    setProcessing(true);
    try {
      const data = await confirmPayment({ paymentKey, orderId, amount });
      updateSubscription({
        plan_name: data.subscription.plan_name,
        plan_display_name: data.subscription.plan_display_name,
      });
      setPaymentResult({
        success: true,
        message: data.message,
        receiptUrl: data.receipt_url,
      });
    } catch (err) {
      setPaymentResult({
        success: false,
        message: err.response?.data?.error || '결제 승인에 실패했습니다.',
      });
    } finally {
      setProcessing(false);
      // URL에서 결제 파라미터 제거
      window.history.replaceState({}, '', '/subscription');
    }
  };

  const handleSelectPlan = async (plan) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (processing) return;

    const currentPlanName = user?.subscription?.plan_name || 'free';

    // 무료 플랜으로 변경
    if (plan.name === 'free') {
      if (currentPlanName === 'free') return;
      if (!confirm('무료 플랜으로 변경하시겠습니까?\n현재 플랜의 혜택이 사라집니다.')) return;
      setProcessing(true);
      try {
        const data = await freeDowngrade();
        updateSubscription({ plan_name: 'free', plan_display_name: '무료' });
        alert(data.message);
      } catch (err) {
        alert(err.response?.data?.error || '플랜 변경에 실패했습니다.');
      } finally {
        setProcessing(false);
      }
      return;
    }

    // 무료 체험 가능하면 체험 먼저 제안
    if (trialEligible) {
      const useTrial = confirm(
        `🎉 첫 결제 혜택!\n${plan.display_name} 플랜을 30일 무료로 체험할 수 있습니다.\n\n무료 체험을 시작하시겠습니까?\n(취소를 누르면 바로 결제로 진행합니다)`
      );
      if (useTrial) {
        setProcessing(true);
        try {
          const data = await startFreeTrial(plan.id);
          updateSubscription({
            plan_name: data.subscription.plan_name,
            plan_display_name: data.subscription.plan_display_name,
          });
          setTrialEligible(false);
          setPaymentResult({ success: true, message: data.message });
        } catch (err) {
          alert(err.response?.data?.error || '무료 체험 시작에 실패했습니다.');
        } finally {
          setProcessing(false);
        }
        return;
      }
    }

    // 유료 플랜 — 결제 진행
    setProcessing(true);
    try {
      const orderData = await preparePayment(plan.id);

      // 토스페이먼츠 SDK 호출
      const clientKey = window.__TOSS_CLIENT_KEY__ || import.meta.env.VITE_TOSS_CLIENT_KEY;
      if (!clientKey) {
        alert('결제 설정이 완료되지 않았습니다. 관리자에게 문의하세요.');
        setProcessing(false);
        return;
      }

      const tossPayments = window.TossPayments(clientKey);

      await tossPayments.requestPayment('카드', {
        amount: orderData.amount,
        orderId: orderData.orderId,
        orderName: orderData.orderName,
        customerName: orderData.customerName || user?.nickname || '',
        successUrl: `${window.location.origin}/subscription?`,
        failUrl: `${window.location.origin}/subscription?`,
      });
    } catch (err) {
      if (err.code === 'USER_CANCEL') {
        // 사용자가 결제 취소
      } else {
        alert(err.response?.data?.error || err.message || '결제 준비에 실패했습니다.');
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleShowHistory = async () => {
    if (!showHistory) {
      try {
        const data = await getPaymentHistory();
        setPaymentHistory(data.payments || []);
      } catch (err) {
        console.error(err);
      }
    }
    setShowHistory(!showHistory);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  const currentPlanName = user?.subscription?.plan_name || 'free';

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      {/* 결제 결과 모달 */}
      {paymentResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm mx-4 text-center">
            {paymentResult.success ? (
              <>
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">결제 완료!</h3>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">결제 실패</h3>
              </>
            )}
            <p className="text-sm text-gray-600 mb-6">{paymentResult.message}</p>
            <div className="flex gap-3">
              {paymentResult.receiptUrl && (
                <a
                  href={paymentResult.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  영수증 보기
                </a>
              )}
              <button
                onClick={() => setPaymentResult(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 py-12">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h1 className="text-3xl font-bold text-white mb-3">구독 플랜</h1>
          <p className="text-slate-400 text-lg">필요에 맞는 플랜을 선택하세요</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 -mt-8 pb-16">
        {/* 무료 체험 배너 */}
        {isAuthenticated && trialEligible && (
          <div className="mb-6 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-5 text-white text-center shadow-lg">
            <p className="text-lg font-bold">첫 결제 혜택 — 30일 무료 체험</p>
            <p className="text-sm text-blue-100 mt-1">유료 플랜을 선택하면 결제 없이 30일간 무료로 이용할 수 있습니다</p>
          </div>
        )}

        {/* 플랜 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = plan.name === currentPlanName;
            const isPopular = plan.name === 'basic';
            const style = PLAN_STYLES[plan.name] || PLAN_STYLES.free;
            const features = PLAN_FEATURES[plan.name] || [];
            const isDowngrade = (PLAN_RANK[plan.name] ?? 0) < (PLAN_RANK[currentPlanName] ?? 0);

            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-2xl shadow-lg flex flex-col overflow-hidden ${
                  isPopular ? 'ring-2 ring-blue-500 shadow-blue-500/10' : 'border border-gray-200'
                }`}
              >
                {isPopular && (
                  <div className={`bg-gradient-to-r ${style.gradient} text-white text-center text-xs font-bold py-1.5`}>
                    MOST POPULAR
                  </div>
                )}

                {isCurrent && (
                  <div className="absolute top-3 right-3">
                    <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      현재 플랜
                    </span>
                  </div>
                )}

                <div className="p-6 flex-1 flex flex-col">
                  <h2 className="text-xl font-bold text-gray-900">{plan.display_name}</h2>
                  <div className="mt-4 mb-6">
                    <span className="text-4xl font-extrabold text-gray-900">
                      {plan.price === 0 ? '무료' : `₩${plan.price.toLocaleString()}`}
                    </span>
                    {plan.price > 0 && <span className="text-gray-500 text-sm ml-1">/월</span>}
                  </div>

                  <ul className="space-y-3 flex-1">
                    {features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        {f.included ? (
                          <svg className={`w-5 h-5 text-${style.accent}-500 flex-shrink-0 mt-0.5`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-gray-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                        <span className={`text-sm ${f.included ? 'text-gray-700' : 'text-gray-400'} ${f.highlight ? 'font-semibold' : ''}`}>
                          {f.label}
                          {f.highlight && !f.included && (
                            <span className="ml-1 text-[9px] text-blue-500 font-bold">NEW</span>
                          )}
                          {f.highlight && f.included && (
                            <span className="ml-1 text-[9px] text-blue-500 font-bold">NEW</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleSelectPlan(plan)}
                    disabled={isCurrent || processing}
                    className={`w-full mt-6 py-3 rounded-xl font-semibold text-sm transition-all ${
                      isCurrent
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : isDowngrade
                        ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        : isPopular
                        ? `bg-gradient-to-r ${style.gradient} text-white shadow-md hover:shadow-lg`
                        : plan.price > 0
                        ? 'bg-gray-900 text-white hover:bg-gray-800'
                        : 'bg-gray-900 text-white hover:bg-gray-800'
                    }`}
                  >
                    {processing ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        처리 중...
                      </span>
                    ) : isCurrent ? (
                      '현재 사용 중'
                    ) : isDowngrade ? (
                      '다운그레이드'
                    ) : plan.price === 0 ? (
                      '무료로 시작'
                    ) : (
                      '결제하기'
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 결제 안내 */}
        <div className="mt-10 text-center space-y-2">
          <p className="text-sm text-gray-400">
            모든 유료 플랜은 30일 단위로 결제됩니다.
          </p>
          <p className="text-sm text-gray-400">
            결제는 토스페이먼츠를 통해 안전하게 처리됩니다.
          </p>
          {isAuthenticated && (
            <button
              onClick={handleShowHistory}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium mt-2"
            >
              {showHistory ? '결제 내역 닫기' : '결제 내역 보기'}
            </button>
          )}
        </div>

        {/* 결제 내역 */}
        {showHistory && (
          <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden max-w-2xl mx-auto">
            <div className="px-5 py-3 border-b border-gray-200">
              <h3 className="text-sm font-bold text-gray-800">결제 내역</h3>
            </div>
            {paymentHistory.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {paymentHistory.map((p) => (
                  <div key={p.id} className="px-5 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-800">{p.plan_name}</p>
                          {p.is_free_trial && (
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">무료체험</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">
                          {new Date(p.created_at).toLocaleDateString('ko-KR')}
                          {p.method && ` · ${p.method}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">
                          {p.is_free_trial ? '무료' : `₩${p.amount.toLocaleString()}`}
                        </p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          p.status === 'paid' ? 'bg-green-100 text-green-700'
                          : p.status === 'refunded' ? 'bg-orange-100 text-orange-700'
                          : p.status === 'cancelled' ? 'bg-red-100 text-red-700'
                          : p.status === 'failed' ? 'bg-gray-100 text-gray-500'
                          : 'bg-gray-100 text-gray-500'
                        }`}>
                          {p.status === 'paid' ? '결제완료' : p.status === 'refunded' ? '환불완료' : p.status === 'cancelled' ? '취소' : p.status === 'failed' ? '실패' : '대기'}
                        </span>
                      </div>
                    </div>
                    {/* 환불 정보 */}
                    {p.status === 'refunded' && (
                      <div className="mt-1.5 text-xs text-orange-600">
                        환불 ₩{(p.refund_amount || 0).toLocaleString()} · {p.refunded_by === 'admin' ? '관리자' : '사용자'} 요청
                        {p.cancel_reason && ` · ${p.cancel_reason}`}
                      </div>
                    )}
                    {/* 환불 버튼 — 유료 결제 & paid 상태만 */}
                    {p.status === 'paid' && !p.is_free_trial && (
                      <div className="mt-2">
                        {refundingId === p.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              id={`refund-reason-${p.id}`}
                              type="text"
                              placeholder="환불 사유 (선택)"
                              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary-500"
                            />
                            <button
                              onClick={async () => {
                                const reason = document.getElementById(`refund-reason-${p.id}`)?.value || '';
                                try {
                                  const data = await requestRefund(p.id, reason);
                                  alert(data.message);
                                  updateSubscription({ plan_name: 'free', plan_display_name: '무료' });
                                  const hist = await getPaymentHistory();
                                  setPaymentHistory(hist.payments || []);
                                } catch (err) {
                                  alert(err.response?.data?.error || '환불에 실패했습니다.');
                                }
                                setRefundingId(null);
                              }}
                              className="px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-semibold hover:bg-orange-600"
                            >
                              환불 확인
                            </button>
                            <button
                              onClick={() => setRefundingId(null)}
                              className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setRefundingId(p.id)}
                            className="text-xs text-gray-400 hover:text-orange-500 transition-colors"
                          >
                            환불 요청
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-sm text-gray-400">
                결제 내역이 없습니다
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
