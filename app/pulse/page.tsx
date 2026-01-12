export default function PulsePage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 py-24 px-6 max-w-4xl mx-auto">
      <h1 className="text-5xl font-bold mb-8">The Pulse</h1>
      <p className="text-xl text-gray-500 mb-12">Latest updates from the AI Frontier.</p>
      
      <div className="space-y-12">
        {[1, 2, 3].map((i) => (
          <article key={i} className="border-b border-gray-100 pb-12">
            <div className="text-xs font-bold uppercase tracking-widest text-[#FF385C] mb-2">Navi's Take</div>
            <h2 className="text-3xl font-bold mb-4 hover:text-[#FF385C] cursor-pointer">Why AI Agents are the new Apps</h2>
            <p className="text-gray-600 leading-relaxed">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
            </p>
          </article>
        ))}
      </div>
    </div>
  )
}
