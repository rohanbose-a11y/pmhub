const FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdDIH6TrC4ca8XHg6CdveYO0D6E96WvaU1vaHbW47yZoh3BOg/viewform?embedded=true'

export function NewProjectFormPage() {
  return (
    <div className="flex flex-col bg-white" style={{ height: 'calc(100vh - 48px)' }}>
      <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-slate-100">
        <h1 className="text-[15px] font-semibold text-slate-800">Create New Project</h1>
        <p className="text-[12px] text-slate-400 mt-0.5">
          Fill in the form below to submit a new project request.
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <iframe
          src={FORM_URL}
          title="Create New Project"
          className="w-full h-full border-0"
          allowFullScreen
        />
      </div>
    </div>
  )
}
