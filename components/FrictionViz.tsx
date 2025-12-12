
import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot } from 'recharts';
import { calculateJointFriction, getNeuralState, NeuralDebugState } from '../services/frictionModel';
import { JointState } from '../types';
import { Brain, Cpu, Activity, Zap, GitCommit, Layers, TrendingUp } from 'lucide-react';

interface FrictionVizProps {
  currentJoints: JointState[];
}

const JOINT_COLORS = ["#3b82f6", "#ef4444", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899"];

interface NeuralNetworkSvgProps { 
  jointIdx: number; 
  velocityRadS: number;
  displayInput: number;
  displayOutput: number;
}

const NeuralNetworkSvg: React.FC<NeuralNetworkSvgProps> = ({ jointIdx, velocityRadS, displayInput, displayOutput }) => {
   const state = getNeuralState(jointIdx, velocityRadS);
   
   if (!state) return <div className="text-xs text-slate-500 text-center mt-4 flex items-center justify-center h-full">No Neural State Available</div>;

   const width = 500;
   const height = 220;
   
   // Layout Positions with Perspective "Slant"
   const hiddenCount = 15;
   
   const inputPos = { x: 50, y: height / 2 };
   const outputPos = { x: 450, y: height / 2 };
   
   const hiddenX = 250;
   const hiddenNodes = state.layer1.activations.map((val, i) => ({
      x: hiddenX + (i - hiddenCount/2) * 2, // Slight x-curve
      y: 20 + (i * (height - 40)) / (hiddenCount - 1),
      activation: val,
      bias: state.layer1.bias[i],
      weightIn: state.layer1.weights[i],
      weightOut: state.layer2.weights[i]
   }));

   // Colors
   const getValueColor = (val: number, alpha = 1) => {
      const intensity = Math.min(1, Math.abs(val));
      return val >= 0 
         ? `rgba(34, 211, 238, ${alpha * (0.2 + intensity * 0.8)})` 
         : `rgba(239, 68, 68, ${alpha * (0.2 + intensity * 0.8)})`;
   };
   
   const getStrokeColor = (val: number) => val >= 0 ? "#22d3ee" : "#ef4444";

   return (
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible select-none">
         <defs>
            <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
               <feGaussianBlur stdDeviation="3" result="blur" />
               <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <linearGradient id="connGradient" gradientUnits="userSpaceOnUse" x1={inputPos.x} y1="0" x2={outputPos.x} y2="0">
               <stop offset="0%" stopColor="#64748b" stopOpacity="0.1" />
               <stop offset="50%" stopColor="#94a3b8" stopOpacity="0.3" />
               <stop offset="100%" stopColor="#64748b" stopOpacity="0.1" />
            </linearGradient>
            <style>
               {`
                  .signal-flow { stroke-dasharray: 4 6; animation: flow 1s linear infinite; }
                  @keyframes flow { to { stroke-dashoffset: -10; } }
               `}
            </style>
         </defs>

         {/* --- 3D PLANE GUIDES --- */}
         <path d={`M ${inputPos.x} 20 L ${hiddenX} 10 L ${outputPos.x} 20`} fill="none" stroke="#334155" strokeWidth="0.5" strokeDasharray="2 2" />
         <path d={`M ${inputPos.x} ${height-20} L ${hiddenX} ${height-10} L ${outputPos.x} ${height-20}`} fill="none" stroke="#334155" strokeWidth="0.5" strokeDasharray="2 2" />

         {/* --- LABELS --- */}
         <text x={inputPos.x} y={15} textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="bold">INPUT</text>
         <text x={hiddenX} y={10} textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="bold">HIDDEN LAYER (15)</text>
         <text x={outputPos.x} y={15} textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="bold">OUTPUT</text>

         {/* --- CONNECTIONS LAYER 1 --- */}
         {hiddenNodes.map((h, i) => (
            <g key={`c1-${i}`}>
               <line 
                  x1={inputPos.x} y1={inputPos.y} x2={h.x} y2={h.y}
                  stroke={getStrokeColor(h.weightIn)}
                  strokeWidth={Math.max(0.2, Math.abs(h.weightIn) * 0.8)}
                  opacity={0.3}
               />
               {Math.abs(state.inputs.normalized) > 0.1 && (
                  <line 
                     x1={inputPos.x} y1={inputPos.y} x2={h.x} y2={h.y}
                     stroke={getStrokeColor(h.weightIn)}
                     strokeWidth={Math.abs(h.weightIn)}
                     opacity={0.6}
                     className="signal-flow"
                  />
               )}
            </g>
         ))}

         {/* --- CONNECTIONS LAYER 2 --- */}
         {hiddenNodes.map((h, i) => (
            <g key={`c2-${i}`}>
               <line 
                  x1={h.x} y1={h.y} x2={outputPos.x} y2={outputPos.y}
                  stroke={getStrokeColor(h.weightOut)}
                  strokeWidth={Math.max(0.2, Math.abs(h.weightOut) * 0.8)}
                  opacity={0.3}
               />
               {Math.abs(h.activation) > 0.2 && (
                  <line 
                     x1={h.x} y1={h.y} x2={outputPos.x} y2={outputPos.y}
                     stroke={getStrokeColor(h.weightOut)}
                     strokeWidth={Math.abs(h.weightOut)}
                     opacity={0.6}
                     className="signal-flow"
                  />
               )}
            </g>
         ))}

         {/* --- HIDDEN NODES --- */}
         {hiddenNodes.map((h, i) => (
            <g key={`h-${i}`}>
               <circle cx={h.x} cy={h.y} r={6} fill="#0f172a" stroke="#334155" strokeWidth={1} />
               <circle cx={h.x} cy={h.y} r={4} fill={getValueColor(h.activation)} filter="url(#glow)" />
            </g>
         ))}

         {/* --- INPUT NODE --- */}
         <g filter="url(#glow)">
            <circle cx={inputPos.x} cy={inputPos.y} r={18} fill="#0f172a" stroke="#22d3ee" strokeWidth={2} />
            <circle cx={inputPos.x} cy={inputPos.y} r={10} fill={getValueColor(state.inputs.normalized)} />
            <rect x={inputPos.x - 30} y={inputPos.y + 25} width={60} height={16} rx={4} fill="#1e293b" stroke="#334155" />
            <text x={inputPos.x} y={inputPos.y + 36} textAnchor="middle" fill="#e2e8f0" fontSize="10" fontFamily="monospace">
               {displayInput.toFixed(1)}°/s
            </text>
         </g>

         {/* --- OUTPUT NODE --- */}
         <g filter="url(#glow)">
            <circle cx={outputPos.x} cy={outputPos.y} r={20} fill="#0f172a" stroke="#f59e0b" strokeWidth={2} />
            <circle cx={outputPos.x} cy={outputPos.y} r={12} fill={getValueColor(state.output / 100)} />
            <rect x={outputPos.x - 35} y={outputPos.y + 30} width={70} height={16} rx={4} fill="#1e293b" stroke="#334155" />
            <text x={outputPos.x} y={outputPos.y + 41} textAnchor="middle" fill="#fbbf24" fontSize="11" fontWeight="bold" fontFamily="monospace">
               {displayOutput.toFixed(2)} Nm
            </text>
         </g>
      </svg>
   );
};

const MetricsPanel: React.FC<{ state: NeuralDebugState }> = ({ state }) => {
   // Calculate simplistic metrics for visualization
   const avgAct = state.layer1.activations.reduce((a, b) => a + Math.abs(b), 0) / state.layer1.activations.length;
   const maxWeight = Math.max(...state.layer1.weights.map(Math.abs));
   const outputBias = state.layer2.bias[0];
   const gain = state.layer2.weights.reduce((a, b) => a + b, 0);

   const MetricRow = ({ label, value, color = "text-slate-400" }: any) => (
      <div className="flex justify-between items-center text-[10px] font-mono border-b border-slate-700/50 pb-1 mb-1 last:border-0">
         <span className="text-slate-500">{label}</span>
         <span className={`font-bold ${color}`}>{value}</span>
      </div>
   );

   return (
      <div className="w-40 bg-slate-900/80 border-l border-slate-700/50 p-3 flex flex-col gap-2">
         <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 mb-1">
            <Activity size={10} /> Live Metrics
         </h4>
         <MetricRow label="Avg Activation" value={avgAct.toFixed(3)} color="text-cyan-400" />
         <MetricRow label="Max Weight L1" value={maxWeight.toFixed(3)} />
         <MetricRow label="Output Bias" value={outputBias.toFixed(3)} color="text-orange-400" />
         <MetricRow label="Net Gain L2" value={gain.toFixed(3)} />
         <div className="mt-auto">
             <div className="text-[9px] text-slate-600 uppercase mb-1">Raw Internal Sigmoid</div>
             <div className="w-full h-8 flex items-end gap-px">
                {state.layer1.activations.map((a, i) => (
                   <div 
                     key={i} 
                     className={`w-full rounded-t-sm ${a > 0 ? 'bg-cyan-500/50' : 'bg-red-500/50'}`}
                     style={{ height: `${Math.abs(a) * 100}%` }}
                   />
                ))}
             </div>
         </div>
      </div>
   );
};

const FrictionViz: React.FC<FrictionVizProps> = ({ currentJoints }) => {
  const [selectedJoint, setSelectedJoint] = useState(0);

  // Generate curve data for the selected joint
  const curveData = useMemo(() => {
    const data = [];
    const start = -250;
    const end = 250;
    const steps = 100;
    
    for (let i = 0; i <= steps; i++) {
      const velDegS = start + (end - start) * (i / steps);
      const velRadS = velDegS * (Math.PI / 180);
      const frictionNm = calculateJointFriction(selectedJoint, velRadS);
      data.push({ x: velDegS, y: frictionNm });
    }
    return data;
  }, [selectedJoint]);

  // Current State
  const currentVelRadS = currentJoints[selectedJoint]?.velocity || 0;
  const currentVelDegS = currentVelRadS * (180 / Math.PI);
  const currentFrictionNm = calculateJointFriction(selectedJoint, currentVelRadS);
  
  const neuralState = getNeuralState(selectedJoint, currentVelRadS);

  return (
    <div className="flex flex-col h-full bg-slate-800 rounded-lg border border-slate-700 overflow-hidden relative shadow-lg">
      
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 bg-slate-900/90 z-10 shrink-0">
        <div className="flex items-center gap-2">
           <div className="p-1 bg-cyan-500/10 rounded">
             <Brain className="text-cyan-400" size={16} />
           </div>
           <div>
              <h2 className="text-xs font-bold text-white tracking-wider leading-none">NEURAL FRICTION</h2>
              <span className="text-[9px] text-slate-400 font-mono">BACK-PROPAGATION NETWORK</span>
           </div>
        </div>
        
        {/* Joint Selector */}
        <div className="flex bg-slate-950 rounded-md p-0.5 border border-slate-700">
           {[0, 1, 2, 3, 4, 5].map((idx) => (
             <button
                key={idx}
                onClick={() => setSelectedJoint(idx)}
                className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition-all ${
                   selectedJoint === idx 
                   ? 'bg-cyan-900 text-cyan-200 shadow-sm' 
                   : 'text-slate-600 hover:text-slate-300'
                }`}
             >
               J{idx + 1}
             </button>
           ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0 relative z-0 bg-slate-900/50">
        
        {/* Top Section: Visualization & Metrics */}
        <div className="flex-1 flex border-b border-slate-700/50 min-h-0">
            {/* SVG Viz */}
            <div className="flex-1 relative overflow-hidden bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800/30 to-slate-900/0">
                <NeuralNetworkSvg 
                  jointIdx={selectedJoint} 
                  velocityRadS={currentVelRadS} 
                  displayInput={currentVelDegS}
                  displayOutput={currentFrictionNm}
                />
            </div>

            {/* Side Metrics Panel */}
            {neuralState && <MetricsPanel state={neuralState} />}
        </div>

        {/* Bottom Section: Curve Reference (Smaller) */}
        <div className="h-[90px] shrink-0 bg-slate-900/30 p-2 relative flex gap-2">
           <div className="w-24 shrink-0 flex flex-col justify-center border-r border-slate-700/30 pr-2">
              <div className="text-[9px] text-slate-500 font-mono mb-1">CURRENT GAIN</div>
              <div className="text-lg font-bold text-white leading-none">
                 {(neuralState?.layer2.weights.reduce((a,b)=>a+b,0) || 0).toFixed(2)}
              </div>
              <div className="text-[9px] text-slate-600 font-mono mt-1">
                 BIAS: {(neuralState?.layer1.bias[0] || 0).toFixed(2)}
              </div>
           </div>
           
           <div className="flex-1 relative">
               <div className="absolute top-0 right-0 text-[9px] text-slate-600 font-mono pointer-events-none">
                  MODEL CHARACTERISTIC CURVE
               </div>
               <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                    <XAxis 
                       type="number" 
                       dataKey="x" 
                       stroke="#475569" 
                       tick={{fontSize: 9}}
                       domain={[-250, 250]}
                       hide
                    />
                    <YAxis 
                       type="number" 
                       dataKey="y" 
                       stroke="#475569" 
                       tick={{fontSize: 9}}
                       width={25}
                       hide
                    />
                    <Tooltip 
                       contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '10px' }}
                       formatter={(val: number) => [val.toFixed(2) + ' Nm']}
                       labelFormatter={() => ''}
                    />
                    <Scatter 
                       name="NN Model" 
                       data={curveData} 
                       fill={JOINT_COLORS[selectedJoint]} 
                       line={{ stroke: JOINT_COLORS[selectedJoint], strokeWidth: 1.5 }} 
                       shape={() => <g />} 
                       isAnimationActive={false}
                    />
                    <ReferenceDot 
                       x={currentVelDegS} 
                       y={currentFrictionNm} 
                       r={3} 
                       fill="#fff" 
                       stroke={JOINT_COLORS[selectedJoint]}
                    />
                  </ScatterChart>
               </ResponsiveContainer>
           </div>
        </div>
      </div>
    </div>
  );
};

export default FrictionViz;
