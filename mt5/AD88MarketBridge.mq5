//+------------------------------------------------------------------+
//| AD88MarketBridge.mq5                                            |
//| Read-only MT5 quote publisher for the AD88 paper workspace.    |
//| It contains no trading, account-login, or order-management code.|
//+------------------------------------------------------------------+
#property strict
#property version   "1.0"
#property description "Read-only Bid/Ask/Last reference publisher for AD88."

input string IngestUrl = "https://ad88-platform.onrender.com/api/mt5/ticks";
input string IngestKey = ""; // Set locally from Render MT5_INGEST_SECRET.
input string BrokerLabel = "MT5 reference terminal";
input string Environment = "demo";
input string Instruments = "XAUUSD,XAGUSD,EURUSD,GBPUSD,USDJPY,USOIL,UKOIL,NATGAS,COPPER";
input int PublishIntervalSeconds = 1;

string EscapeJson(string value)
  {
   StringReplace(value,"\\","\\\\");
   StringReplace(value,"\"","\\\"");
   StringReplace(value,"\r"," ");
   StringReplace(value,"\n"," ");
   return value;
  }

bool IsSafeInput(const string value)
  {
   return StringLen(value)>0 && StringLen(value)<=512;
  }

string Trim(const string value)
  {
   string result=value;
   StringTrimLeft(result);
   StringTrimRight(result);
   return result;
  }

string TickJson(const string symbol,MqlTick &tick)
  {
   double last=tick.last;
   if(last<=0.0 && tick.bid>0.0 && tick.ask>0.0)
      last=(tick.bid+tick.ask)/2.0;
   if(last<=0.0)
      return "";
   long timestamp=(long)tick.time_msc;
   if(timestamp<=0)
      timestamp=(long)TimeTradeServer()*1000;
   return StringFormat("{\"symbol\":\"%s\",\"bid\":%.10f,\"ask\":%.10f,\"last\":%.10f,\"time\":%I64d}",EscapeJson(symbol),tick.bid,tick.ask,last,timestamp);
  }

void PublishQuotes()
  {
   if(!IsSafeInput(IngestKey))
     {
      Print("AD88 Market Bridge: IngestKey is empty; no request was sent.");
      return;
     }

   string requested[];
   int total=StringSplit(Instruments,',',requested);
   if(total<=0)
      return;

   string ticks="";
   int accepted=0;
   for(int i=0;i<total && accepted<64;i++)
     {
      string symbol=Trim(requested[i]);
      if(StringLen(symbol)==0)
         continue;
      if(!SymbolSelect(symbol,true))
         continue;
      MqlTick tick;
      if(!SymbolInfoTick(symbol,tick))
         continue;
      string item=TickJson(symbol,tick);
      if(StringLen(item)==0)
         continue;
      if(accepted>0)
         ticks+=",";
      ticks+=item;
      accepted++;
     }

   if(accepted==0)
     {
      Print("AD88 Market Bridge: no listed instrument returned a usable tick.");
      return;
     }

   string body=StringFormat("{\"broker\":\"%s\",\"environment\":\"%s\",\"ticks\":[%s]}",EscapeJson(BrokerLabel),EscapeJson(Environment),ticks);
   char request[];
   char response[];
   string response_headers="";
   StringToCharArray(body,request,0,WHOLE_ARRAY,CP_UTF8);
   if(ArraySize(request)>0)
      ArrayResize(request,ArraySize(request)-1); // Do not send a C-string terminator.
   string headers="Content-Type: application/json\r\nx-ad88-mt5-key: "+IngestKey+"\r\n";
   ResetLastError();
   int status=WebRequest("POST",IngestUrl,headers,5000,request,response,response_headers);
   if(status!=202)
     {
      PrintFormat("AD88 Market Bridge: publish failed (HTTP %d, terminal error %d).",status,GetLastError());
     }
  }

int OnInit()
  {
   if(PublishIntervalSeconds<1)
      return INIT_PARAMETERS_INCORRECT;
   EventSetTimer(PublishIntervalSeconds);
   PublishQuotes();
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
  }

void OnTimer()
  {
   PublishQuotes();
  }

void OnTick()
  {
   // OnTimer owns publication so every selected Market Watch symbol can be
   // sampled. No trading operation is performed here.
  }
