
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { JointState } from '../types';

interface HistoryEntry {
  time: string;
  torques: number[];
  velocities?: number[];
}

interface ChartsProps {
  history: HistoryEntry[];
  currentJoints: JointState[];
}

interface VelocityChartProps {
  history: HistoryEntry[];
}

const JOINT_COLORS = ["#3b82f6", "#ef4444", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899"];

export const VelocityChart: React.FC<VelocityChartProps> = ({ history }) => {
  const data = history.map(h => ({
    time: h.time,
    v1: h.velocities?.[0] || 0,
    v2: h.velocities?.[1] || 0,
    v3: h.velocities?.[2] || 0,
    v4: h.velocities?.[3] || 0,
    v5: h.velocities?.[4] || 0,
    v6: h.velocities?.[5] || 0,
  }));

  return (
    <div className="w-full h-full bg-slate-900/90 backdrop-blur-sm rounded-lg border border-slate-700/50 p-2 flex flex-col shadow-xl">
      <h3 className="text-[10px] font-bold text-slate-400 mb-1 ml-2 flex items-center gap-2">
        <span>REAL-TIME JOINT VELOCITY (deg/s)</span>
        <span className="h-px flex-1 bg-slate-700/50"></span>
      </h3>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
            <XAxis dataKey="time" hide />
            <YAxis 
              stroke="#64748b" 
              tick={{fontSize: 9}} 
              domain={[-400, 400]} 
              allowDataOverflow={true}
              width={30}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', padding: '4px' }}
              itemStyle={{ fontSize: '10px', padding: 0 }}
              labelStyle={{ display: 'none' }}
              isAnimationActive={false}
            />
            <Legend 
               wrapperStyle={{ fontSize: '10px', paddingTop: '0px' }} 
               iconSize={8}
            />
            {JOINT_COLORS.map((color, idx) => (
              <Line 
                key={idx}
                isAnimationActive={false} 
                type="monotone" 
                dataKey={`v${idx+1}`} 
                stroke={color} 
                dot={false} 
                strokeWidth={1.5} 
                name={`J${idx+1}`} 
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const DynamicsCharts: React.FC<ChartsProps> = ({ history, currentJoints }) => {
  // Transform history for easier LineChart consumption
  const lineData = history.map(h => ({
    time: h.time,
    j1: h.torques[0],
    j2: h.torques[1],
    j3: h.torques[2],
    j4: h.torques[3],
    j5: h.torques[4],
    j6: h.torques[5],
  }));

  const barData = currentJoints.map((j, idx) => ({
    name: `J${idx + 1}`,
    torque: Math.abs(j.torque),
    limit: [200, 200, 100, 50, 30, 20][idx] // Fictional torque limits
  }));

  return (
    <div className="flex flex-col gap-4 h-full">
      
      {/* Real-time Torque Monitor (Bar) */}
      <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 h-1/3 flex flex-col">
        <h3 className="text-sm font-bold text-slate-300 mb-2">Instantaneous Torque Load (Abs)</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis type="number" stroke="#94a3b8" domain={[0, 100]} allowDataOverflow={true} />
            <YAxis dataKey="name" type="category" stroke="#94a3b8" width={30} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569' }}
              itemStyle={{ color: '#e2e8f0' }}
              cursor={{fill: '#334155', opacity: 0.4}}
            />
            <Bar 
              dataKey="torque" 
              fill="#f59e0b" 
              radius={[0, 4, 4, 0]} 
              name="Torque (Nm)" 
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Historical Torque Lines */}
      <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 h-2/3 flex flex-col">
        <h3 className="text-sm font-bold text-slate-300 mb-2 flex justify-between">
          <span>Joint Torque History (Nm)</span>
          <span className="text-xs text-orange-400 bg-orange-900/30 px-2 py-0.5 rounded border border-orange-500/30">Dynamics Only (Friction Subtracted)</span>
        </h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={lineData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="time" hide />
            <YAxis stroke="#94a3b8" domain={[-100, 100]} allowDataOverflow={true} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569' }}
              itemStyle={{ color: '#e2e8f0' }}
              labelStyle={{ color: '#94a3b8' }}
              isAnimationActive={false}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }}/>
            <Line isAnimationActive={false} type="monotone" dataKey="j1" stroke="#3b82f6" dot={false} strokeWidth={2} name="J1 (Base)" />
            <Line isAnimationActive={false} type="monotone" dataKey="j2" stroke="#ef4444" dot={false} strokeWidth={2} name="J2 (Shldr)" />
            <Line isAnimationActive={false} type="monotone" dataKey="j3" stroke="#10b981" dot={false} strokeWidth={2} name="J3 (Elbow)" />
            {/* Hiding wrist joints to reduce clutter, or make them thinner/transparent */}
            <Line isAnimationActive={false} type="monotone" dataKey="j4" stroke="#8b5cf6" dot={false} strokeWidth={1} strokeDasharray="3 3" name="J4" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
