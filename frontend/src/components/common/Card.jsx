const Card = ({ 
    children, 
    title, 
    className = '',
    headerClassName = '',
    bodyClassName = ''
  }) => {
    return (
      <div className={`bg-white rounded-lg shadow-md overflow-hidden w-full ${className}`}>
        {title && (
          <div className={`px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-200 ${headerClassName}`}>
            <h3 className="text-lg font-semibold text-gray-800 break-words">{title}</h3>
          </div>
        )}
        <div className={`p-4 sm:p-6 ${bodyClassName} w-full`}>
          {children}
        </div>
      </div>
    );
  };
  
  export default Card;