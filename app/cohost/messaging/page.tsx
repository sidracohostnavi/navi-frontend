export default function MessagingPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-5">
        <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M21 16a2 2 0 01-2 2H7l-4 4V6a2 2 0 012-2h14a2 2 0 012 2v10z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Messaging Coming Soon</h2>
      <p className="text-sm text-gray-400 max-w-xs">
        Guest and team messaging will be available here. Check back soon.
      </p>
    </div>
  );
}
