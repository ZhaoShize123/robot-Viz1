import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot } from 'recharts';
import { calculateJointFriction, getNeuralState } from '../services/frictionModel';
import { JointState } from '../types';
import { Brain, Cpu, Activity, Zap } from 'lucide-react';

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

   const width = 400;
   const height = 180;
   const paddingX = 40;
   const paddingY = 30;
   
   // Layout Positions
   const inputX = paddingX;
   const hiddenX = width / 2;
   const outputX = width - paddingX;
   const centerY = height / 2;

   const inputPos = { x: inputX, y: centerY };
   const outputPos = { x: outputX, y: centerY };

   const hiddenCount = 15;
   const hiddenNodes = state.layer1.activations.map((val, i) => ({
      x: hiddenX,
      y: paddingY + (i * (height - 2 * paddingY)) / (hiddenCount - 1),
      activation: val,
      bias: state.layer1.bias[i],
      weightIn: state.layer1.weights[i],
      weightOut: state.layer2.weights[i]
   }));

   // Helper for color intensity based on value (-1 to 1 range for tanh/sigmoid-like)
   const getValueColor = (val: number, alpha = 1) => {
      // Cyan for positive, Red/Pink for negative
      const isPos = val >= 0;
      const intensity = Math.min(1, Math.abs(val));
      if (isPos) {
         // Cyan: 34, 211, 238
         return `rgba(34, 211, 238, ${alpha * (0.3 + intensity * 0.7)})`;
      } else {
         // Red: 239, 68, 68
         return `rgba(239, 68, 68, ${alpha * (0.3 + intensity * 0.7)})`;
      }
   };
   
   const getStrokeColor = (val: number) => {
      return val >= 0 ? "#22d3ee" : "#ef4444";
   };

   return (
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible select-none">
         <defs>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
               <feGaussianBlur stdDeviation="2" result="blur" />
               <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <style>
               {`
                  .signal-flow {
                     stroke-dasharray: 4 4;
                     animation: dash 1s linear infinite;
                  }
                  @keyframes dash {
                     to {
                        stroke-dashoffset: -8;
                     }
                  }
               `}
            </style>
         </defs>

         {/* --- LAYERS BACKGROUND LABELS --- */}
         <text x={inputX} y={15} textAnchor="middle" fill="#64748b" fontSize="9" fontWeight="bold" letterSpacing="1">INPUT</text>
         <text x={hiddenX} y={15} textAnchor="middle" fill="#64748b" fontSize="9" fontWeight="bold" letterSpacing="1">HIDDEN (Sigmoid)</text>
         <text x={outputX} y={15} textAnchor="middle" fill="#64748b" fontSize="9" fontWeight="bold" letterSpacing="1">OUTPUT (Linear)</text>

         {/* --- CONNECTIONS: INPUT -> HIDDEN --- */}
         {hiddenNodes.map((h, i) => {
            const opacity = Math.min(1, Math.abs(h.weightIn) * 0.5 + 0.1);
            const isActive = Math.abs(h.weightIn * state.inputs.normalized) > 0.5;
            return (
               <g key={`c1-${i}`}>
                  <line 
                     x1={inputPos.x} y1={inputPos.y}
                     x2={h.x} y2={h.y}
                     stroke={getStrokeColor(h.weightIn)}
                     strokeWidth={Math.max(0.5, Math.abs(h.weightIn))}
                     opacity={opacity * 0.4}
                  />
                  {/* Active Signal Flow Animation */}
                  {isActive && (
                     <line 
                        x1={inputPos.x} y1={inputPos.y}
                        x2={h.x} y2={h.y}
                        stroke={getStrokeColor(h.weightIn)}
                        strokeWidth={Math.max(1, Math.abs(h.weightIn))}
                        opacity={0.8}
                        className="signal-flow"
                     />
                  )}
                  <title>W: {h.weightIn.toFixed(3)}</title>
               </g>
            );
         })}

         {/* --- CONNECTIONS: HIDDEN -> OUTPUT --- */}
         {hiddenNodes.map((h, i) => {
            const opacity = Math.min(1, Math.abs(h.weightOut) * 0.5 + 0.1);
            const isActive = Math.abs(h.weightOut * h.activation) > 0.5;
            return (
               <g key={`c2-${i}`}>
                  <line 
                     x1={h.x} y1={h.y}
                     x2={outputPos.x} y2={outputPos.y}
                     stroke={getStrokeColor(h.weightOut)}
                     strokeWidth={Math.max(0.5, Math.abs(h.weightOut))}
                     opacity={opacity * 0.4}
                  />
                  {isActive && (
                     <line 
                        x1={h.x} y1={h.y}
                        x2={outputPos.x} y2={outputPos.y}
                        stroke={getStrokeColor(h.weightOut)}
                        strokeWidth={Math.max(1, Math.abs(h.weightOut))}
                        opacity={0.8}
                        className="signal-flow"
                     />
                  )}
                  <title>W: {h.weightOut.toFixed(3)}</title>
               </g>
            );
         })}

         {/* --- INPUT NODE --- */}
         <g>
            <circle cx={inputPos.x} cy={inputPos.y} r={14} fill="#0f172a" stroke="#94a3b8" strokeWidth={2} />
            <circle cx={inputPos.x} cy={inputPos.y} r={8} fill={getValueColor(state.inputs.normalized)} />
            
            {/* Value Label */}
            <rect x={inputPos.x - 25} y={inputPos.y + 20} width={50} height={14} rx={2} fill="#1e293b" stroke="#334155" />
            <text x={inputPos.x} y={inputPos.y + 30} textAnchor="middle" fill="#e2e8f0" fontSize="9" fontFamily="monospace">
               {displayInput.toFixed(1)}°/s
            </text>
         </g>

         {/* --- HIDDEN NODES --- */}
         {hiddenNodes.map((h, i) => (
            <g key={`h-${i}`}>
               <circle cx={h.x} cy={h.y} r={5} fill="#0f172a" stroke="none" />
               <circle 
                  cx={h.x} cy={h.y} 
                  r={4} 
                  fill={getValueColor(h.activation)} 
                  filter="url(#glow)"
                  opacity={0.8}
               />
               <circle 
                  cx={h.x} cy={h.y} 
                  r={4} 
                  fill="none"
                  stroke={getValueColor(h.activation)}
                  strokeWidth={1}
                  opacity={0.5}
               />
               <title>Activation: {h.activation.toFixed(3)}{'\n'}Bias: {h.bias.toFixed(3)}</title>
            </g>
         ))}

         {/* --- OUTPUT NODE --- */}
         <g>
            <circle cx={outputPos.x} cy={outputPos.y} r={16} fill="#0f172a" stroke="#e2e8f0" strokeWidth={2} />
            <circle cx={outputPos.x} cy={outputPos.y} r={10} fill={getValueColor(state.output / 100)} filter="url(#glow)" />
            
            {/* Value Label */}
            <rect x={outputPos.x - 30} y={outputPos.y + 24} width={60} height={14} rx={2} fill="#1e293b" stroke="#334155" />
            <text x={outputPos.x} y={outputPos.y + 34} textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="bold" fontFamily="monospace">
               {displayOutput.toFixed(2)} Nm
            </text>
         </g>

      </svg>
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

  return (
    <div className="flex flex-col h-full bg-slate-800 rounded-lg border border-slate-700 overflow-hidden relative shadow-lg">
      
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-900/80 backdrop-blur-sm z-10 shrink-0">
        <div className="flex items-center gap-2">
           <Brain className="text-cyan-400" size={18} />
           <div>
              <h2 className="text-sm font-bold text-white tracking-wider leading-none">NEURAL FRICTION</h2>
              <span className="text-[10px] text-cyan-400 font-mono">BP NETWORK (1-15-1)</span>
           </div>
        </div>
        
        {/* Joint Selector */}
        <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-600">
           {[0, 1, 2, 3, 4, 5].map((idx) => (
             <button
                key={idx}
                onClick={() => setSelectedJoint(idx)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                   selectedJoint === idx 
                   ? 'bg-cyan-900/80 text-cyan-200 border border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.3)]' 
                   : 'text-slate-500 hover:text-slate-300'
                }`}
             >
               J{idx + 1}
             </button>
           ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-2 gap-2 min-h-0 relative z-0 bg-slate-900/40">
        
        {/* Neural Network Visualization Area (SVG) */}
        <div className="flex-1 bg-slate-900/80 rounded-lg border border-slate-700/50 relative overflow-hidden flex flex-col items-center justify-center p-2 shadow-inner">
             <div className="absolute top-2 left-2 text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                <Cpu size={10} />
                <span>LIVE TOPOLOGY</span>
             </div>
             <div className="w-full h-full max-h-[200px]">
                <NeuralNetworkSvg 
                  jointIdx={selectedJoint} 
                  velocityRadS={currentVelRadS} 
                  displayInput={currentVelDegS}
                  displayOutput={currentFrictionNm}
                />
             </div>
        </div>

        {/* Neural Network Curve Viz */}
        <div className="h-[120px] shrink-0 border border-slate-700/50 rounded-lg bg-slate-900/60 p-1 relative">
           <div className="absolute top-1 right-2 text-[9px] text-slate-500 font-mono z-10 pointer-events-none">
              MODEL CURVE (Torque vs Velocity)
           </div>
           <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                <XAxis 
                   type="number" 
                   dataKey="x" 
                   stroke="#64748b" 
                   tick={{fontSize: 9}}
                   domain={[-250, 250]}
                   tickCount={5}
                />
                <YAxis 
                   type="number" 
                   dataKey="y" 
                   stroke="#64748b" 
                   tick={{fontSize: 9}}
                   width={30}
                   tickCount={3}
                />
                <Tooltip 
                   cursor={{ strokeDasharray: '3 3' }}
                   contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f1f5f9', fontSize: '11px', padding: '4px' }}
                   formatter={(value: number) => [value.toFixed(2) + ' Nm', 'Friction']}
                   labelFormatter={(label) => `Vel: ${label.toFixed(0)}`}
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
                   r={4} 
                   fill="#fff" 
                   stroke={JOINT_COLORS[selectedJoint]}
                   strokeWidth={2}
                   ifOverflow="extendDomain"
                />
              </ScatterChart>
           </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default FrictionViz;