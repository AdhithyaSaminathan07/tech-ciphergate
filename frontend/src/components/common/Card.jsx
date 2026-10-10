const Card = ({ 
    children, 
    title, 
    className = '',
    headerClassName = '',
    bodyClassName = ''
  }) => {
    return (
      <div className={`bg-white rounded-xl shadow-sm border border-[#E2ECE5] overflow-hidden w-full transition-all duration-200 ${className}`}>
        {title && (
          <div className={`px-4 py-3 sm:px-6 sm:py-3.5 border-b border-[#E2ECE5] bg-[#F6F9F7]/60 ${headerClassName}`}>
            <h3 className="text-base font-bold text-[#0F241D] tracking-tight">{title}</h3>
          </div>
        )}
        <div className={`p-4 sm:p-5 ${bodyClassName} w-full`}>
          {children}
        </div>
      </div>
    );
  };
  
  export default Card;