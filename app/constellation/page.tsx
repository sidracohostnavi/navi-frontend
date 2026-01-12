export default function ConstellationPage() {
  return (
    <div className="min-h-screen bg-black text-white py-24 px-6">
      <div className="max-w-7xl mx-auto text-center mb-16">
        <h1 className="text-5xl font-bold mb-6">The Constellation</h1>
        <p className="text-xl text-gray-400">Community Wisdom & Wins</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-gray-900 p-6 rounded-2xl border border-gray-800">
            <p className="text-gray-300 mb-6 font-serif italic">"I saved 15 hours this week using CoHost. It's literally magic."</p>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-700 rounded-full" />
              <div className="text-sm font-bold">User_{i}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
