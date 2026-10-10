const Button = ({ 
    children, 
    type = 'button', 
    variant = 'primary', 
    size = 'md', 
    onClick, 
    disabled = false,
    fullWidth = false,
    className = ''
  }) => {
    // Base classes matching enterprise design system
    const baseClasses = 'rounded-xl font-semibold shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 active:scale-[0.98] inline-flex items-center justify-center gap-1.5';
    
    // Variant classes using centralized forest-green & semantic palette
    const variantClasses = {
      primary: 'bg-[#087443] hover:bg-[#065F37] text-white focus:ring-[#087443]/50 shadow-sm hover:shadow',
      secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-700 focus:ring-slate-300',
      danger: 'bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-500/50 shadow-sm',
      success: 'bg-[#087443] hover:bg-[#065F37] text-white focus:ring-[#087443]/50 shadow-sm',
      outline: 'border border-[#E2ECE5] bg-white hover:bg-[#F0FAF4] text-slate-700 hover:text-[#087443] hover:border-emerald-300 focus:ring-[#087443]/30'
    };
    
    const sizeClasses = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-5 py-2.5 text-base'
    };
    
    const widthClass = fullWidth ? 'w-full' : '';
    const disabledClass = disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer';
    
    return (
      <button
        type={type}
        className={`${baseClasses} ${variantClasses[variant] || variantClasses.primary} ${sizeClasses[size]} ${widthClass} ${disabledClass} ${className}`}
        onClick={onClick}
        disabled={disabled}
      >
        {children}
      </button>
    );
  };
  
  export default Button;