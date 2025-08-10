import React from 'react'
import NeonBeatLab from './NeonBeatLab'
import NeonVisualizer from './NeonVisualizer'

export default function App(){
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="p-4 md:p-6">
        <h1 className="text-center text-4xl md:text-6xl font-black tracking-wider mb-4 bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">NEON BEAT LAB</h1>
      </div>
      <NeonVisualizer />
      <div className="p-4 md:p-8">
        <NeonBeatLab />
      </div>
    </div>
  )
}


